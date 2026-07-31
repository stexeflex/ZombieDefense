import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { GamePhase, GameSnapshot } from '../../../shared/game-types';
import { GameService } from './game.service';

/** Only the fields the phase reaction looks at. */
function snapshotWith(phase: GamePhase): GameSnapshot {
  return {
    phase,
    wave: 1,
    waveKind: 'normal',
    players: {},
  } as unknown as GameSnapshot;
}

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(GameService);
  });

  it('drops the placement ghost when the wave starts', () => {
    (service as unknown as { reactToPhase(snapshot: GameSnapshot): void }).reactToPhase(
      snapshotWith('build'),
    );
    service.selectBuild('wood');
    expect(service.selectedBuild()).toBe('wood');

    (service as unknown as { reactToPhase(snapshot: GameSnapshot): void }).reactToPhase(
      snapshotWith('combat'),
    );
    expect(service.selectedBuild()).toBeNull();
    expect(service.placementRotation()).toBe(0);
  });

  it('drops the previous result when the shared room returns to the lobby', () => {
    service.lastReward.set({ gold: 120, victory: false, mapId: 'outpost' });

    (service as unknown as { reactToPhase(snapshot: GameSnapshot): void }).reactToPhase(
      snapshotWith('lobby'),
    );

    expect(service.lastReward()).toBeNull();
  });

  it('never sends an ammo purchase for the infinite pistol', () => {
    const sent: string[] = [];
    service.sessionId.set('player-1');
    service.snapshot.set({
      ...snapshotWith('build'),
      players: {
        'player-1': {
          weapon: 'pistol',
          owned: ['pistol'],
          reserveAmmo: 0,
        },
      },
    } as unknown as GameSnapshot);
    (service as unknown as { room: { send(type: string): void } }).room = {
      send: (type) => sent.push(type),
    };

    service.buyAmmo();

    expect(service.canBuyAmmo()).toBe(false);
    expect(service.ammoFull()).toBe(true);
    expect(sent).toEqual([]);
  });

  it('only sells a paid weapon that belongs to the player', () => {
    const sent: Array<[string, unknown]> = [];
    service.sessionId.set('player-1');
    service.snapshot.set({
      ...snapshotWith('build'),
      players: {
        'player-1': {
          weapon: 'rifle',
          owned: ['pistol', 'rifle'],
          weaponRefunds: { rifle: 700 },
        },
      },
    } as unknown as GameSnapshot);
    (service as unknown as { room: { send(type: string, payload?: unknown): void } }).room = {
      send: (type, payload) => sent.push([type, payload]),
    };

    service.sellWeapon('pistol');
    service.sellWeapon('laser');
    service.sellWeapon('rifle');

    expect(sent).toEqual([['sell_weapon', 'rifle']]);
  });

  it('only offers and sends structure sales for the local owner', () => {
    const sent: Array<[string, unknown]> = [];
    service.sessionId.set('player-1');
    service.snapshot.set({
      ...snapshotWith('build'),
      defenses: {
        foreign: {
          id: 'foreign',
          ownerId: 'player-2',
          type: 'wood',
          health: 420,
          maxHealth: 420,
          refund: 160,
        },
        own: {
          id: 'own',
          ownerId: 'player-1',
          type: 'wood',
          health: 420,
          maxHealth: 420,
          refund: 160,
        },
      },
      vehicles: {},
    } as unknown as GameSnapshot);
    (service as unknown as { room: { send(type: string, payload?: unknown): void } }).room = {
      send: (type, payload) => sent.push([type, payload]),
    };

    service.focusedDefenseId.set('foreign');
    expect(service.focusedDefense()?.sellable).toBe(false);
    expect(service.focusedDefense()?.sellBlockedTitle).toContain('Besitzer');
    service.sellFocused();

    service.focusedDefenseId.set('own');
    expect(service.focusedDefense()?.sellable).toBe(true);
    service.sellFocused();

    expect(sent).toEqual([['sell', { id: 'own' }]]);
  });

  it('settles the run before leaving without changing the shared room phase', async () => {
    const sent: string[] = [];
    let confirmed: ((payload: { runId: string }) => void) | undefined;
    service.snapshot.set({
      ...snapshotWith('combat'),
      runId: 'run-1',
      runGold: 250,
      runVictory: false,
      mapId: 'outpost',
    });
    (service as unknown as { room: unknown }).room = {
      send: (type: string) => sent.push(type),
      onMessage: (_type: string, handler: (payload: { runId: string }) => void) => {
        confirmed = handler;
        return () => undefined;
      },
    };

    const settlement = service.settleRunReward();
    expect(sent).toEqual(['leave_run']);
    confirmed?.({ runId: 'run-1' });
    await settlement;
  });

  it('moves the connected squad back into the shared lobby room', async () => {
    const sent: string[] = [];
    vi.spyOn(service, 'settleRunReward').mockResolvedValue();
    const disconnect = vi.spyOn(service, 'disconnect').mockResolvedValue();
    service.snapshot.set(snapshotWith('gameover'));
    (service as unknown as { room: { send(type: string): void } }).room = {
      send: (type) => sent.push(type),
    };

    const transition = service.returnToLobby();
    await Promise.resolve();
    expect(sent).toEqual(['return_lobby']);

    const lobby = snapshotWith('lobby');
    service.snapshot.set(lobby);
    service.snapshot$.next(lobby);
    await transition;

    expect(disconnect).not.toHaveBeenCalled();
  });
});
