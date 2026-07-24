import { Injectable, computed, inject, signal } from '@angular/core';
import { Client, type Room } from '@colyseus/sdk';
import { Subject } from 'rxjs';
import type {
  DefenseType,
  GameSnapshot,
  PlayerInput,
  WeaponType,
} from '../../../shared/game-types';
import { PLAYER_BASE_SPEED } from '../../../shared/game-types';
import { ProgressService } from './progress.service';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly progress = inject(ProgressService);
  private client?: Client;
  private room?: Room;

  readonly connection = signal<ConnectionState>('idle');
  readonly errorMessage = signal('');
  readonly snapshot = signal<GameSnapshot | null>(null);
  readonly sessionId = signal('');
  readonly lastReward = signal<{ gold: number; victory: boolean } | null>(null);
  readonly selectedBuild = signal<DefenseType | null>(null);
  readonly placementRotation = signal(0);
  readonly explosion$ = new Subject<{ x: number; y: number; radius: number }>();
  readonly snapshot$ = new Subject<GameSnapshot>();

  readonly player = computed(() => {
    const state = this.snapshot();
    return state?.players[this.sessionId()] ?? null;
  });
  readonly isHost = computed(
    () => this.snapshot()?.hostSessionId === this.sessionId(),
  );

  async connect(lobbyCode: string, name: string, create: boolean) {
    if (this.connection() === 'connecting') return;
    await this.disconnect();
    this.connection.set('connecting');
    this.errorMessage.set('');
    this.lastReward.set(null);

    try {
      this.client = new Client(this.serverEndpoint());
      const options = {
        lobbyCode: lobbyCode.toUpperCase(),
        name: name.trim(),
        upgrades: this.progress.upgrades(),
      };
      this.room = create
        ? await this.client.create('zombie_defense', options)
        : await this.client.joinOrCreate('zombie_defense', options);
      this.sessionId.set(this.room.sessionId);
      this.bindRoom(this.room);
      this.connection.set('connected');
      localStorage.setItem('zombie-defense-name', name.trim());
    } catch (error) {
      this.connection.set('error');
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'Die Verbindung zum Spielserver ist fehlgeschlagen.',
      );
    }
  }

  async disconnect() {
    const room = this.room;
    this.room = undefined;
    if (room) {
      room.removeAllListeners();
      await room.leave(true).catch(() => undefined);
    }
    this.snapshot.set(null);
    this.sessionId.set('');
    this.selectedBuild.set(null);
    this.placementRotation.set(0);
    this.connection.set('idle');
  }

  startRun() {
    this.room?.send('start');
  }

  restartRun() {
    this.lastReward.set(null);
    this.room?.send('restart');
  }

  sendInput(input: PlayerInput) {
    this.room?.send('input', input);
  }

  setReady(ready: boolean) {
    this.room?.send('ready', ready);
  }

  buyWeapon(weapon: WeaponType) {
    this.room?.send('buy_weapon', weapon);
  }

  buyAmmo() {
    this.room?.send('buy_ammo');
  }

  selectBuild(type: DefenseType | null) {
    if (type !== this.selectedBuild()) this.placementRotation.set(0);
    this.selectedBuild.set(type);
  }

  rotateBuild() {
    if (this.selectedBuild() !== 'barricade') return;
    this.placementRotation.update((rotation) => (rotation + Math.PI / 2) % Math.PI);
  }

  placeDefense(type: DefenseType, x: number, y: number) {
    this.room?.send('place', {
      type,
      x,
      y,
      rotation: type === 'barricade' ? this.placementRotation() : 0,
    });
  }

  localMoveSpeed() {
    return PLAYER_BASE_SPEED * (1 + this.progress.upgrades().moveSpeed * 0.02);
  }

  sellNearest() {
    this.room?.send('sell');
  }

  repairNearest() {
    this.room?.send('repair');
  }

  throwGrenade(x: number, y: number) {
    this.room?.send('grenade', { x, y });
  }

  private bindRoom(room: Room) {
    room.onMessage<GameSnapshot>('snapshot', (snapshot) => {
      this.snapshot.set(snapshot);
      this.snapshot$.next(snapshot);
    });
    room.onMessage<{ x: number; y: number; radius: number }>('explosion', (event) =>
      this.explosion$.next(event),
    );
    room.onMessage<{ gold: number; runId: string; victory: boolean }>(
      'permanent_reward',
      (reward) => {
        if (this.progress.addRunReward(reward.gold, reward.runId)) {
          this.lastReward.set({ gold: reward.gold, victory: reward.victory });
        }
      },
    );
    room.onError((_code, message) => {
      this.errorMessage.set(message || 'Der Spielserver hat einen Fehler gemeldet.');
    });
    room.onLeave((code) => {
      if (code !== 4000) {
        this.connection.set('error');
        this.errorMessage.set('Die Verbindung zur Lobby wurde getrennt.');
      }
    });
  }

  private serverEndpoint() {
    const configured = localStorage.getItem('zombie-defense-server-url');
    if (configured) return configured;

    const isLocalDevelopment =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname === '::1';
    if (!isLocalDevelopment) return location.origin;

    const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${location.hostname}:2567`;
  }
}
