import { Injectable, computed, inject, signal } from '@angular/core';
import { Client, type Room } from '@colyseus/sdk';
import { Subject } from 'rxjs';
import {
  DASH_SPEED,
  DEFAULT_MAP_ID,
  DEFENSES,
  ENGINEER_DISCOUNT,
  PLAYER_BASE_SPEED,
  PLAYER_ABILITIES,
  VEHICLES,
  WEAPONS,
  discountedCost,
  findMap,
  isMeleeWeapon,
  repairCost,
  reserveCapacity,
  vehicleTopSpeed,
  type DefenseType,
  type FxEvent,
  type GamePhase,
  type GameSnapshot,
  type PlayerInput,
  type VehicleType,
  type WeaponType,
} from '../../../shared/game-types';
import { AudioService } from './audio.service';
import { ProgressService } from './progress.service';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

/** How long the browser waits for the server to confirm the payout. */
const SETTLE_TIMEOUT = 1200;
/** How long it waits for the socket to close before it moves on regardless. */
const LEAVE_TIMEOUT = 1500;
/** A shared lobby transition should arrive with the next server snapshot. */
const LOBBY_RETURN_TIMEOUT = 2000;
const RECONNECT_STORAGE_PREFIX = 'zombie-defense-reconnect:';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly progress = inject(ProgressService);
  private readonly audio = inject(AudioService);
  private client?: Client;
  private room?: Room;
  private reconnectStorageKey = '';
  private pageUnloading = false;
  private lastPhase: GamePhase | null = null;
  private lastWave = 0;

  readonly connection = signal<ConnectionState>('idle');
  readonly errorMessage = signal('');
  readonly snapshot = signal<GameSnapshot | null>(null);
  readonly sessionId = signal('');
  readonly lastReward = signal<{ gold: number; victory: boolean; mapId: string } | null>(null);
  readonly selectedBuild = signal<DefenseType | null>(null);
  readonly selectedVehicle = signal<VehicleType | null>(null);
  readonly placementRotation = signal(0);
  readonly preferredMap = signal(this.storedMap());
  readonly preferredEndless = signal(this.storedEndless());
  readonly focusedDefenseId = signal('');
  readonly relocatingId = signal('');
  readonly fx$ = new Subject<FxEvent[]>();
  readonly snapshot$ = new Subject<GameSnapshot>();

  readonly player = computed(() => {
    const state = this.snapshot();
    return state?.players[this.sessionId()] ?? null;
  });
  readonly isHost = computed(() => this.snapshot()?.hostSessionId === this.sessionId());
  readonly activeMap = computed(() => findMap(this.snapshot()?.mapId ?? this.preferredMap()));

  /**
   * What the player stands next to right now, with its repair and sell price.
   * A parked vehicle is worked on exactly like a structure.
   */
  readonly focusedDefense = computed(() => {
    const snapshot = this.snapshot();
    const id = this.focusedDefenseId();
    if (!snapshot || snapshot.phase !== 'build') return null;
    const defense = snapshot.defenses[id];
    const vehicle = snapshot.vehicles?.[id];
    const target = defense ?? vehicle;
    if (!target) return null;
    const cost = defense ? DEFENSES[defense.type].cost : VEHICLES[vehicle.type].cost;
    const owned = target.ownerId === this.sessionId();
    const occupied = Boolean(vehicle && vehicle.crew.length > 0);
    return {
      id: target.id,
      label: defense ? DEFENSES[defense.type].label : VEHICLES[vehicle.type].label,
      health: Math.round(target.health),
      maxHealth: target.maxHealth,
      repairCost: repairCost(target, this.progress.perks().engineer ? ENGINEER_DISCOUNT : 0),
      sellRefund: target.refund,
      fullPrice: target.refund >= cost,
      owned,
      // A hull with the squad inside stays where it is, and another player's
      // purchase can never be converted into the local player's build money.
      sellable: owned && !occupied,
      movable: !occupied,
      sellBlockedTitle: !owned
        ? 'Nur der Besitzer kann dieses Objekt verkaufen'
        : occupied
          ? 'Erst aussteigen'
          : '',
    };
  });

  /** Structure or parked hull currently attached to the placement cursor. */
  readonly relocating = computed(() => {
    const snapshot = this.snapshot();
    const id = this.relocatingId();
    if (!snapshot || snapshot.phase !== 'build' || !id) return null;
    const defense = snapshot.defenses[id];
    if (defense) return { id, kind: 'defense' as const, entity: defense };
    const vehicle = snapshot.vehicles[id];
    if (vehicle) return { id, kind: 'vehicle' as const, entity: vehicle };
    return null;
  });

  /** The vehicle the local player is sitting in, for the HUD. */
  readonly myVehicle = computed(() => {
    const snapshot = this.snapshot();
    const player = this.player();
    const vehicle = player?.vehicleId ? snapshot?.vehicles?.[player.vehicleId] : undefined;
    if (!vehicle) return null;
    const config = VEHICLES[vehicle.type];
    return {
      label: config.label,
      perk: config.perk,
      seats: config.seats,
      crew: vehicle.crew.length,
      health: Math.round(vehicle.health),
      maxHealth: vehicle.maxHealth,
      percent: Math.max(0, (vehicle.health / vehicle.maxHealth) * 100),
      driving: vehicle.crew[0] === this.sessionId(),
      boost: Boolean(config.boost),
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

  /** Compact HUD copy for the one selected G ability. */
  readonly ability = computed(() => {
    const player = this.player();
    const type = player?.ability ?? this.progress.ability();
    return {
      type,
      ...PLAYER_ABILITIES[type],
      charges: player?.abilityCharges ?? PLAYER_ABILITIES[type].charges,
      max: player?.abilityMax ?? PLAYER_ABILITIES[type].charges,
      cooldown: player?.abilityCooldown ?? 0,
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
    if (player.weapon === 'pistol' || isMeleeWeapon(player.weapon)) return true;
    return (
      player.reserveAmmo >= reserveCapacity(player.weapon, this.progress.upgrades().reserveAmmo)
    );
  });

  /** The fallback pistol and every melee weapon use no bought ammunition. */
  readonly canBuyAmmo = computed(() => {
    const player = this.player();
    return Boolean(player && player.weapon !== 'pistol' && !isMeleeWeapon(player.weapon));
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
      const normalizedCode = lobbyCode.toUpperCase();
      const reconnectStorageKey = `${RECONNECT_STORAGE_PREFIX}${normalizedCode}`;
      this.reconnectStorageKey = reconnectStorageKey;
      const options = {
        lobbyCode: normalizedCode,
        name: name.trim(),
        mapId: this.preferredMap(),
        endless: this.preferredEndless(),
        upgrades: this.progress.upgrades(),
        perks: this.progress.perks(),
        ability: this.progress.ability(),
      };
      const reconnectToken = create ? '' : (sessionStorage.getItem(reconnectStorageKey) ?? '');
      if (reconnectToken) {
        try {
          this.room = await this.client.reconnect(reconnectToken);
        } catch {
          sessionStorage.removeItem(reconnectStorageKey);
        }
      }
      this.room ??= create
        ? await this.client.create('zombie_defense', options)
        : await this.client.joinOrCreate('zombie_defense', options);
      sessionStorage.setItem(reconnectStorageKey, this.room.reconnectionToken);
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
    // During reload/close the browser itself drops the socket. Sending a
    // consented leave here would destroy the reserved session before reload.
    if (this.pageUnloading) return;
    const room = this.room;
    if (room && this.reconnectStorageKey) sessionStorage.removeItem(this.reconnectStorageKey);
    if (room && settleReward) await this.settleRunReward();
    this.room = undefined;
    if (room) {
      room.removeAllListeners();
      // A socket that never reports its close must not freeze the button that
      // is waiting on this — the room is gone for us either way.
      await Promise.race([
        room.leave(true).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, LEAVE_TIMEOUT)),
      ]);
    }
    this.audio.setTrack('none');
    this.snapshot.set(null);
    this.sessionId.set('');
    this.selectedBuild.set(null);
    this.selectedVehicle.set(null);
    this.placementRotation.set(0);
    this.focusedDefenseId.set('');
    this.relocatingId.set('');
    this.connection.set('idle');
    this.lastPhase = null;
    this.lastWave = 0;
  }

  /** Marks a real page unload so the server may distinguish it from leaving the lobby. */
  prepareForUnload() {
    this.pageUnloading = true;
  }

  startRun() {
    this.audio.unlock();
    this.room?.send('start');
  }

  restartRun() {
    this.lastReward.set(null);
    this.room?.send('restart');
  }

  /** Keep the connected squad together and move its finished room back to the lobby. */
  async returnToLobby(onSettled?: () => void) {
    await this.moveRoomToLobby('return_lobby', onSettled);
  }

  /** The host concedes the current run and takes the connected squad back. */
  async abandonRun(onSettled?: () => void) {
    await this.moveRoomToLobby('abandon_run', onSettled);
  }

  private async moveRoomToLobby(message: 'return_lobby' | 'abandon_run', onSettled?: () => void) {
    await this.settleRunReward();
    onSettled?.();
    if (!this.room) return;

    const lobbySnapshot = this.waitForPhase('lobby', LOBBY_RETURN_TIMEOUT);
    this.room.send(message);
    const arrived = await lobbySnapshot;
    if (!arrived) {
      this.errorMessage.set('Die gemeinsame Lobby konnte nicht geöffnet werden.');
    }
  }

  private waitForPhase(phase: GamePhase, timeoutMs: number) {
    if (this.snapshot()?.phase === phase) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const subscription = this.snapshot$.subscribe((snapshot) => {
        if (snapshot.phase !== phase) return;
        window.clearTimeout(timer);
        subscription.unsubscribe();
        resolve(true);
      });
      const timer = window.setTimeout(() => {
        subscription.unsubscribe();
        resolve(false);
      }, timeoutMs);
    });
  }

  /**
   * Wait until the server has sent the current payout before closing the room.
   * A local snapshot fallback covers a connection that disappears during the
   * short confirmation window.
   */
  async settleRunReward() {
    const room = this.room;
    const current = this.snapshot();
    if (!room || !current || current.phase === 'lobby' || !current.runId) {
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
      }, SETTLE_TIMEOUT);
      // A socket that is already gone can never answer, so the local snapshot
      // pays out right away instead of leaving the caller hanging.
      try {
        room.send('leave_run');
      } catch {
        this.creditVisibleRunReward();
        finish();
      }
    });
  }

  /** Synchronous fallback used when a tab is closed without waiting for the server. */
  creditVisibleRunReward() {
    const current = this.snapshot();
    if (!current || current.phase === 'lobby' || !current.runId) {
      return;
    }
    this.progress.addRunReward(current.runGold, current.runId, current.mapId, current.runVictory);
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
      ability: this.progress.ability(),
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
    if (type) this.cancelMove();
    if (type !== this.selectedBuild()) this.placementRotation.set(0);
    this.selectedBuild.set(type);
    this.selectedVehicle.set(null);
    if (type) this.audio.play('ui');
  }

  selectVehicle(type: VehicleType | null) {
    if (type) this.cancelMove();
    if (type !== this.selectedVehicle()) this.placementRotation.set(0);
    this.selectedVehicle.set(type);
    this.selectedBuild.set(null);
    if (type) this.audio.play('ui');
  }

  clearSelection() {
    this.selectBuild(null);
    this.selectedVehicle.set(null);
    this.cancelMove();
  }

  rotateBuild() {
    const type = this.selectedBuild();
    const moving = this.relocating();
    const movingRotates =
      moving?.kind === 'vehicle' ||
      (moving?.kind === 'defense' && DEFENSES[moving.entity.type].kind === 'barricade');
    if (this.selectedVehicle() || (type && DEFENSES[type].kind === 'barricade') || movingRotates) {
      this.placementRotation.update((rotation) => (rotation + Math.PI / 2) % Math.PI);
    }
  }

  placeDefense(type: DefenseType, x: number, y: number) {
    this.room?.send('place', {
      type,
      x,
      y,
      rotation: this.placementRotation(),
    });
  }

  placeVehicle(type: VehicleType, x: number, y: number) {
    this.audio.play('build');
    this.room?.send('place_vehicle', {
      type,
      x,
      y,
      rotation: this.placementRotation(),
    });
  }

  /** One key gets in and out again, so nobody has to remember two of them. */
  useVehicle() {
    this.room?.send('use_vehicle');
  }

  /** What a vehicle costs this player right now, motor pool perk included. */
  vehiclePrice(type: VehicleType) {
    return discountedCost(VEHICLES[type].cost, this.player()?.vehicleDiscount ?? 0);
  }

  localMoveSpeed() {
    return PLAYER_BASE_SPEED * (1 + this.progress.upgrades().moveSpeed * 0.02);
  }

  /** Steering is predicted locally, so the hull needs the same top speed. */
  localVehicleSpeed(type: VehicleType) {
    return vehicleTopSpeed(type, this.progress.upgrades().vehicleSpeed);
  }

  /** Called by the scene so panel and highlight always mean the same structure. */
  setFocusedDefense(id: string) {
    if (this.focusedDefenseId() !== id) this.focusedDefenseId.set(id);
  }

  sellFocused() {
    const target = this.focusedDefense();
    if (!target || !target.sellable) return;
    this.audio.play('ui');
    this.room?.send('sell', { id: target.id });
  }

  repairFocused() {
    const target = this.focusedDefense();
    if (!target || target.repairCost === 0) return;
    this.audio.play('build');
    this.room?.send('repair', { id: target.id });
  }

  beginMoveFocused() {
    const target = this.focusedDefense();
    const snapshot = this.snapshot();
    const defense = target ? snapshot?.defenses[target.id] : undefined;
    const vehicle = target ? snapshot?.vehicles[target.id] : undefined;
    if (!target?.movable || (!defense && !vehicle)) return;
    this.selectedBuild.set(null);
    this.selectedVehicle.set(null);
    this.placementRotation.set((defense ?? vehicle)!.rotation);
    this.relocatingId.set(target.id);
    this.room?.send('begin_move', { id: target.id });
    this.audio.play('ui');
  }

  moveFocused(x: number, y: number) {
    const moving = this.relocating();
    if (!moving) return;
    this.room?.send('move_placed', {
      id: moving.id,
      x,
      y,
      rotation: this.placementRotation(),
    });
    this.relocatingId.set('');
    this.focusedDefenseId.set('');
    this.audio.play('build');
  }

  cancelMove() {
    if (this.relocatingId()) this.room?.send('cancel_move');
    this.relocatingId.set('');
  }

  useAbility(x: number, y: number) {
    this.room?.send('ability', { x, y });
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
      const credited = this.progress.addRunReward(
        reward.gold,
        reward.runId,
        reward.mapId,
        reward.victory,
      );
      // The result screen shows the run's full payout, while ProgressService
      // only adds the part that was not already secured before a reconnect.
      this.lastReward.set({
        gold: reward.gold,
        victory: reward.victory,
        mapId: reward.mapId,
      });
      if (credited) this.audio.play(reward.victory ? 'victory' : 'gameover');
    });
    room.onError((_code, message) => {
      this.errorMessage.set(message || 'Der Spielserver hat einen Fehler gemeldet.');
    });
    room.onDrop(() => {
      this.connection.set('connecting');
      this.errorMessage.set('Verbindung wird wiederhergestellt …');
    });
    room.onReconnect(() => {
      this.connection.set('connected');
      this.errorMessage.set('');
      if (this.reconnectStorageKey) {
        sessionStorage.setItem(this.reconnectStorageKey, room.reconnectionToken);
      }
    });
    room.onLeave((code) => {
      this.audio.setTrack('none');
      if (this.room === room && this.reconnectStorageKey) {
        sessionStorage.removeItem(this.reconnectStorageKey);
      }
      if (code !== 4000) {
        this.connection.set('error');
        this.errorMessage.set('Die Verbindung zur Lobby wurde getrennt.');
      }
    });
  }

  private reactToPhase(snapshot: GameSnapshot) {
    if (snapshot.phase !== this.lastPhase) {
      this.lastPhase = snapshot.phase;
      if (snapshot.phase === 'lobby') this.lastReward.set(null);
      // A ghost left over from the last build phase would come back with the
      // next one, so the start of a wave drops the selection.
      if (
        snapshot.phase !== 'build' &&
        (this.selectedBuild() || this.selectedVehicle() || this.relocatingId())
      ) {
        this.clearSelection();
      }
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
