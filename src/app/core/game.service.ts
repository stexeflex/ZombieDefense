import { Injectable, computed, inject, signal } from '@angular/core';
import { Client, type Room } from '@colyseus/sdk';
import { Subject } from 'rxjs';
import {
  DASH_SPEED,
  DEFAULT_MAP_ID,
  DEFENSES,
  ENGINEER_DISCOUNT,
  PLAYER_BASE_SPEED,
  WEAPONS,
  discountedCost,
  findMap,
  repairCost,
  reserveCapacity,
  type DefenseType,
  type FxEvent,
  type GamePhase,
  type GameSnapshot,
  type PlayerInput,
  type WeaponType,
} from '../../../shared/game-types';
import { AudioService } from './audio.service';
import { ProgressService } from './progress.service';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly progress = inject(ProgressService);
  private readonly audio = inject(AudioService);
  private client?: Client;
  private room?: Room;
  private lastPhase: GamePhase | null = null;
  private lastWave = 0;
  private readonly settledRunIds = new Set<string>();

  readonly connection = signal<ConnectionState>('idle');
  readonly errorMessage = signal('');
  readonly snapshot = signal<GameSnapshot | null>(null);
  readonly sessionId = signal('');
  readonly lastReward = signal<{ gold: number; victory: boolean; mapId: string } | null>(null);
  readonly selectedBuild = signal<DefenseType | null>(null);
  readonly placementRotation = signal(0);
  readonly preferredMap = signal(this.storedMap());
  readonly preferredEndless = signal(this.storedEndless());
  readonly focusedDefenseId = signal('');
  readonly fx$ = new Subject<FxEvent[]>();
  readonly snapshot$ = new Subject<GameSnapshot>();

  readonly player = computed(() => {
    const state = this.snapshot();
    return state?.players[this.sessionId()] ?? null;
  });
  readonly isHost = computed(() => this.snapshot()?.hostSessionId === this.sessionId());
  readonly activeMap = computed(() => findMap(this.snapshot()?.mapId ?? this.preferredMap()));

  /** The structure the player stands next to, with its repair and sell price. */
  readonly focusedDefense = computed(() => {
    const snapshot = this.snapshot();
    const defense = snapshot?.defenses[this.focusedDefenseId()];
    if (!snapshot || !defense || snapshot.phase !== 'build') return null;
    return {
      id: defense.id,
      label: DEFENSES[defense.type].label,
      health: Math.round(defense.health),
      maxHealth: defense.maxHealth,
      repairCost: repairCost(defense, this.progress.perks().engineer ? ENGINEER_DISCOUNT : 0),
      sellRefund: defense.refund,
      fullPrice: defense.refund >= DEFENSES[defense.type].cost,
    };
  });

  /** Dash charges, ready ones and the reload of the next one, for the HUD. */
  readonly dash = computed(() => {
    const player = this.player();
    if (!player) return { charges: 0, max: 0, cooldown: 0, active: false };
    return {
      charges: player.dashCharges,
      max: player.dashMax,
      cooldown: player.dashCooldown,
      active: player.dashing > 0,
    };
  });

  /** The dash shield: points left and how full it is, for the HUD bar. */
  readonly shield = computed(() => {
    const player = this.player();
    if (!player || player.shield <= 0) return { value: 0, percent: 0 };
    return {
      value: Math.max(1, Math.round(player.shield)),
      percent: player.shieldMax > 0 ? Math.min(100, (player.shield / player.shieldMax) * 100) : 0,
    };
  });

  /** The arsenal with its slot numbers, ready for the HUD and the shop. */
  readonly arsenal = computed(() => {
    const player = this.player();
    return (player?.owned ?? ['pistol']).map((weapon, index) => ({
      type: weapon,
      slot: index + 1,
      label: WEAPONS[weapon].label,
      short: WEAPONS[weapon].short,
      active: player?.weapon === weapon,
    }));
  });

  /** Spare rounds are capped, so a full player cannot waste money on ammo. */
  readonly ammoFull = computed(() => {
    const player = this.player();
    if (!player) return false;
    if (player.weapon === 'pistol') return true;
    return (
      player.reserveAmmo >= reserveCapacity(player.weapon, this.progress.upgrades().reserveAmmo)
    );
  });

  /** The pistol is the endless fallback and therefore never needs bought ammunition. */
  readonly canBuyAmmo = computed(() => {
    const player = this.player();
    return Boolean(player && player.weapon !== 'pistol');
  });

  /** What a weapon costs this player right now, starter perk included. */
  weaponPrice(weapon: WeaponType) {
    return discountedCost(WEAPONS[weapon].cost, this.player()?.weaponDiscount ?? 0);
  }

  /** What a barricade or turret costs this player right now. */
  defensePrice(type: DefenseType) {
    const config = DEFENSES[type];
    const player = this.player();
    const left =
      config.kind === 'barricade'
        ? (player?.barricadeDiscount ?? 0)
        : (player?.turretDiscount ?? 0);
    return discountedCost(config.cost, left);
  }

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
        mapId: this.preferredMap(),
        endless: this.preferredEndless(),
        upgrades: this.progress.upgrades(),
        perks: this.progress.perks(),
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

  async disconnect(settleReward = true) {
    const room = this.room;
    if (room && settleReward) await this.settleRunReward();
    this.room = undefined;
    if (room) {
      room.removeAllListeners();
      await room.leave(true).catch(() => undefined);
    }
    this.audio.setTrack('none');
    this.snapshot.set(null);
    this.sessionId.set('');
    this.selectedBuild.set(null);
    this.placementRotation.set(0);
    this.focusedDefenseId.set('');
    this.connection.set('idle');
    this.lastPhase = null;
    this.lastWave = 0;
  }

  startRun() {
    this.audio.unlock();
    this.room?.send('start');
  }

  restartRun() {
    this.lastReward.set(null);
    this.room?.send('restart');
  }

  /**
   * Leave the finished room alone and open a fresh lobby with the same code.
   * Other clients remain in their current room until they decide for
   * themselves where to go.
   */
  async returnToLobby(lobbyCode: string, name: string) {
    await this.settleRunReward();
    await this.disconnect(false);
    await this.connect(lobbyCode, name, true);
  }

  /**
   * Wait until the server has sent the current payout before closing the room.
   * A local snapshot fallback covers a connection that disappears during the
   * short confirmation window.
   */
  async settleRunReward() {
    const room = this.room;
    const current = this.snapshot();
    if (
      !room ||
      !current ||
      current.phase === 'lobby' ||
      !current.runId ||
      this.settledRunIds.has(current.runId)
    ) {
      return;
    }

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      };
      const unsubscribe = room.onMessage<{ runId: string }>('leave_settled', () => finish());
      const timeout = setTimeout(() => {
        this.creditVisibleRunReward();
        finish();
      }, 1200);
      room.send('leave_run');
    });
  }

  /** Synchronous fallback used when a tab is closed without waiting for the server. */
  creditVisibleRunReward() {
    const current = this.snapshot();
    if (
      !current ||
      current.phase === 'lobby' ||
      !current.runId ||
      this.settledRunIds.has(current.runId)
    ) {
      return;
    }
    this.progress.addRunReward(current.runGold, current.runId, current.mapId, current.runVictory);
    this.settledRunIds.add(current.runId);
  }

  sendInput(input: PlayerInput) {
    this.room?.send('input', input);
  }

  /**
   * The permanent upgrades travel with the join, so a purchase made while the
   * squad waits in the lobby has to be sent again to count for this run.
   */
  syncLoadout() {
    this.room?.send('loadout', {
      upgrades: this.progress.upgrades(),
      perks: this.progress.perks(),
    });
  }

  setReady(ready: boolean) {
    this.audio.play('ui');
    this.room?.send('ready', ready);
  }

  selectMap(mapId: string) {
    this.preferredMap.set(mapId);
    localStorage.setItem('zombie-defense-map', mapId);
    this.audio.play('ui');
    this.room?.send('select_map', mapId);
  }

  /** Campaign or endless — the same maps, only the end of the run changes. */
  selectEndless(endless: boolean) {
    this.preferredEndless.set(endless);
    localStorage.setItem('zombie-defense-endless', endless ? '1' : '0');
    this.audio.play('ui');
    this.room?.send('select_mode', endless);
  }

  buyWeapon(weapon: WeaponType) {
    this.audio.play('build');
    this.room?.send('buy_weapon', weapon);
  }

  switchWeapon(weapon: WeaponType) {
    const player = this.player();
    if (!player || player.weapon === weapon || !player.owned.includes(weapon)) return;
    this.audio.play('reload', 0.6);
    this.room?.send('switch_weapon', weapon);
  }

  sellWeapon(weapon: WeaponType) {
    const player = this.player();
    if (!player || weapon === 'pistol' || !player.owned.includes(weapon)) return;
    this.audio.play('ui');
    this.room?.send('sell_weapon', weapon);
  }

  /** Steps through the arsenal, used by the mouse wheel. */
  cycleWeapon(direction: number) {
    const player = this.player();
    const owned = player?.owned ?? [];
    if (!player || owned.length < 2) return;
    const index = owned.indexOf(player.weapon);
    const next = (index + direction + owned.length * 2) % owned.length;
    this.switchWeapon(owned[next]);
  }

  selectWeaponSlot(slot: number) {
    const owned = this.player()?.owned ?? [];
    if (slot >= 1 && slot <= owned.length) this.switchWeapon(owned[slot - 1]);
  }

  buyAmmo() {
    if (!this.canBuyAmmo() || this.ammoFull()) return;
    this.audio.play('reload');
    this.room?.send('buy_ammo');
  }

  selectBuild(type: DefenseType | null) {
    if (type !== this.selectedBuild()) this.placementRotation.set(0);
    this.selectedBuild.set(type);
    if (type) this.audio.play('ui');
  }

  rotateBuild() {
    const type = this.selectedBuild();
    if (!type || DEFENSES[type].kind !== 'barricade') return;
    this.placementRotation.update((rotation) => (rotation + Math.PI / 2) % Math.PI);
  }

  placeDefense(type: DefenseType, x: number, y: number) {
    this.room?.send('place', {
      type,
      x,
      y,
      rotation: this.placementRotation(),
    });
  }

  localMoveSpeed() {
    return PLAYER_BASE_SPEED * (1 + this.progress.upgrades().moveSpeed * 0.02);
  }

  /** Called by the scene so panel and highlight always mean the same structure. */
  setFocusedDefense(id: string) {
    if (this.focusedDefenseId() !== id) this.focusedDefenseId.set(id);
  }

  sellFocused() {
    const target = this.focusedDefense();
    if (!target) return;
    this.audio.play('ui');
    this.room?.send('sell', { id: target.id });
  }

  repairFocused() {
    const target = this.focusedDefense();
    if (!target || target.repairCost === 0) return;
    this.audio.play('build');
    this.room?.send('repair', { id: target.id });
  }

  throwGrenade(x: number, y: number) {
    this.room?.send('grenade', { x, y });
  }

  private bindRoom(room: Room) {
    room.onMessage<GameSnapshot>('snapshot', (snapshot) => {
      this.snapshot.set(snapshot);
      this.snapshot$.next(snapshot);
      if (snapshot.fx && snapshot.fx.length > 0) this.fx$.next(snapshot.fx);
      this.reactToPhase(snapshot);
    });
    room.onMessage<{
      gold: number;
      runId: string;
      victory: boolean;
      mapId: string;
    }>('permanent_reward', (reward) => {
      this.settledRunIds.add(reward.runId);
      if (this.progress.addRunReward(reward.gold, reward.runId, reward.mapId, reward.victory)) {
        this.lastReward.set({
          gold: reward.gold,
          victory: reward.victory,
          mapId: reward.mapId,
        });
      }
      this.audio.play(reward.victory ? 'victory' : 'gameover');
    });
    room.onError((_code, message) => {
      this.errorMessage.set(message || 'Der Spielserver hat einen Fehler gemeldet.');
    });
    room.onLeave((code) => {
      this.audio.setTrack('none');
      if (code !== 4000) {
        this.connection.set('error');
        this.errorMessage.set('Die Verbindung zur Lobby wurde getrennt.');
      }
    });
  }

  private reactToPhase(snapshot: GameSnapshot) {
    if (snapshot.phase !== this.lastPhase) {
      this.lastPhase = snapshot.phase;
      // A ghost left over from the last build phase would come back with the
      // next one, so the start of a wave drops the selection.
      if (snapshot.phase !== 'build' && this.selectedBuild()) this.selectBuild(null);
      if (snapshot.phase === 'combat') this.audio.play('wave', 0.9);
      this.audio.setTrack(
        snapshot.phase === 'combat'
          ? snapshot.waveKind === 'boss'
            ? 'boss'
            : 'combat'
          : snapshot.phase === 'build'
            ? 'build'
            : 'none',
      );
    }
    if (snapshot.phase === 'combat' && snapshot.wave !== this.lastWave) {
      this.lastWave = snapshot.wave;
      this.audio.setTrack(snapshot.waveKind === 'boss' ? 'boss' : 'combat');
      if (snapshot.waveKind !== 'normal') this.audio.play('boss-roar', 0.8);
    }
  }

  /** Dashing is predicted locally so the burst of speed feels immediate. */
  localDashSpeed() {
    return this.localMoveSpeed() * DASH_SPEED;
  }

  private storedMap() {
    if (typeof localStorage === 'undefined') return DEFAULT_MAP_ID;
    return localStorage.getItem('zombie-defense-map') ?? DEFAULT_MAP_ID;
  }

  private storedEndless() {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('zombie-defense-endless') === '1';
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
