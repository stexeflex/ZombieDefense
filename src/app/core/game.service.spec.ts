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

  it('opens an individual fresh lobby instead of moving the teammate', async () => {
    vi.spyOn(service, 'settleRunReward').mockResolvedValue();
    vi.spyOn(service, 'disconnect').mockResolvedValue();
    vi.spyOn(service, 'connect').mockResolvedValue();

    await service.returnToLobby('ABCDE', 'Alex');

    expect(service.disconnect).toHaveBeenCalledWith(false);
    expect(service.connect).toHaveBeenCalledWith('ABCDE', 'Alex', true);
  });
});
