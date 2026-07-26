import type { Client } from 'colyseus';
import { Room } from 'colyseus';
import {
  ARENA,
  DEFAULT_MAP_ID,
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  SHIELD_SHARE,
  START_MONEY,
  findMap,
  reserveCapacity,
  upgradeMaxLevel,
  type DefenseType,
  type PermanentPerks,
  type PermanentUpgrades,
  type PlayerInput,
  type UpgradeKey,
  type WeaponType,
} from '../../../shared/game-types.js';
import { AbilitySystem } from '../game/abilities.js';
import { BuildSystem } from '../game/build.js';
import { PlayerSystem } from '../game/players.js';
import { ProjectileSystem } from '../game/projectiles.js';
import { TurretSystem } from '../game/turrets.js';
import { WaveSystem } from '../game/waves.js';
import { EMPTY_INPUT, GameWorld } from '../game/world.js';
import { ZombieSystem } from '../game/zombies.js';
import { GameState, PlayerState } from '../state/game-state.js';

interface JoinOptions {
  lobbyCode?: string;
  name?: string;
  mapId?: string;
  endless?: boolean;
  upgrades?: Partial<PermanentUpgrades>;
  perks?: Partial<PermanentPerks>;
}

const COLORS = ['#69f0ae', '#57b8ff', '#ffcc66', '#ff6b8a'];

const PLAYER_PRECISION: Record<string, number> = {
  x: 10,
  y: 10,
  rotation: 1000,
  health: 1,
  shield: 1,
  reviveProgress: 100,
  reloading: 100,
  grenadeCooldown: 10,
  dashCooldown: 10,
  dashing: 100,
  firing: 100,
  hurt: 100,
  money: 1,
};
const ZOMBIE_PRECISION: Record<string, number> = {
  x: 10,
  y: 10,
  rotation: 100,
  health: 1,
  maxHealth: 1,
  burning: 10,
  chilled: 10,
  attacking: 100,
  charging: 100,
  casting: 100,
};
const PROJECTILE_PRECISION: Record<string, number> = { x: 10, y: 10, vx: 1, vy: 1 };
const DEFENSE_PRECISION: Record<string, number> = {
  x: 1,
  y: 1,
  rotation: 100,
  health: 1,
  maxHealth: 1,
};
const HAZARD_PRECISION: Record<string, number> = { x: 1, y: 1, r: 1, life: 100, maxLife: 100 };

/**
 * Network glue: takes messages, drives the systems on a fixed tick and pushes
 * a compact snapshot. All the rules live in `../game`.
 */
export class ZombieRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  private world!: GameWorld;
  private abilities!: AbilitySystem;
  private playerSystem!: PlayerSystem;
  private zombieSystem!: ZombieSystem;
  private projectiles!: ProjectileSystem;
  private turrets!: TurretSystem;
  private build!: BuildSystem;
  private waves!: WaveSystem;
  private snapshotElapsed = 0;

  onCreate(options: JoinOptions) {
    const state = new GameState();
    state.lobbyCode = this.cleanCode(options.lobbyCode);
    state.endless = Boolean(options.endless);
    this.setState(state);

    this.world = new GameWorld(state, findMap(options.mapId ?? DEFAULT_MAP_ID));
    this.abilities = new AbilitySystem(this.world);
    this.playerSystem = new PlayerSystem(this.world);
    this.zombieSystem = new ZombieSystem(this.world, this.abilities);
    this.projectiles = new ProjectileSystem(this.world);
    this.turrets = new TurretSystem(this.world);
    this.build = new BuildSystem(this.world, this.playerSystem);
    this.waves = new WaveSystem(
      this.world,
      this.playerSystem,
      this.build,
      (reward) => this.broadcast('permanent_reward', reward),
      () => this.abilities.clearHazards(),
    );

    this.applyMap(options.mapId ?? DEFAULT_MAP_ID);
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 50);
    this.registerMessages();
  }

  private registerMessages() {
    this.onMessage('input', (client, input: Partial<PlayerInput>) => {
      const runtime = this.world.runtime.get(client.sessionId);
      if (!runtime) return;
      runtime.input = this.cleanInput(input);
    });
    this.onMessage('select_map', (client, mapId: string) => {
      if (!this.mayChangeSetup(client.sessionId)) return;
      this.applyMap(mapId);
      this.broadcastSnapshot();
    });
    this.onMessage('select_mode', (client, endless: boolean) => {
      if (!this.mayChangeSetup(client.sessionId)) return;
      this.state.endless = Boolean(endless);
      this.applyMap(this.state.mapId);
      this.broadcastSnapshot();
    });
    this.onMessage('start', (client) => {
      if (client.sessionId === this.state.hostSessionId && this.state.phase === 'lobby') {
        this.waves.startRun();
      }
    });
    this.onMessage('restart', (client) => {
      if (client.sessionId === this.state.hostSessionId && this.state.phase === 'gameover') {
        this.waves.startRun();
      }
    });
    this.onMessage('loadout', (client, options: JoinOptions) => {
      this.applyLoadout(client.sessionId, options);
    });
    this.onMessage('ready', (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (player && this.state.phase === 'build') player.ready = Boolean(ready);
      if (this.state.phase === 'build' && this.world.everyoneReady()) this.waves.startNextWave();
    });
    this.onMessage('buy_weapon', (client, weapon: WeaponType) =>
      this.build.buyWeapon(client.sessionId, weapon),
    );
    this.onMessage('switch_weapon', (client, weapon: WeaponType) =>
      this.build.selectWeapon(client.sessionId, weapon),
    );
    this.onMessage('buy_ammo', (client) => this.build.buyAmmo(client.sessionId));
    this.onMessage(
      'place',
      (client, payload: { type?: DefenseType; x?: number; y?: number; rotation?: number }) =>
        this.build.placeDefense(client.sessionId, payload),
    );
    this.onMessage('sell', (client, payload?: { id?: string }) =>
      this.build.sellDefense(client.sessionId, payload?.id),
    );
    this.onMessage('repair', (client, payload?: { id?: string }) =>
      this.build.repairDefense(client.sessionId, payload?.id),
    );
    this.onMessage('grenade', (client, target: { x?: number; y?: number }) =>
      this.playerSystem.throwGrenade(client.sessionId, target),
    );
  }

  onJoin(client: Client, options: JoinOptions) {
    const upgrades = this.cleanUpgrades(options.upgrades);
    const perks = this.cleanPerks(options.perks);
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = this.cleanName(options.name);
    player.color = COLORS[this.state.players.size % COLORS.length];
    const spawn = this.world.playerSpawn(this.state.players.size);
    player.x = spawn.x;
    player.y = spawn.y;
    player.maxHealth = Math.round(100 * (1 + upgrades.maxHealth * 0.02));
    player.health = player.maxHealth;
    player.shieldMax = Math.round(player.maxHealth * SHIELD_SHARE);
    player.money = START_MONEY;
    player.ammo = this.playerSystem.magazineSize('pistol', upgrades);
    player.reserveAmmo = reserveCapacity('pistol', upgrades.reserveAmmo);
    player.dashMax = this.playerSystem.maxDashes(upgrades);
    player.dashCharges = player.dashMax;
    player.grenades = this.playerSystem.maxGrenades(perks);
    player.owned.clear();
    player.owned.push('pistol');

    this.state.players.set(client.sessionId, player);
    this.world.runtime.set(client.sessionId, {
      input: { ...EMPTY_INPUT },
      upgrades,
      perks,
      grenadeRecharge: [],
      grenadeThrowLock: 0,
      dashRecharge: [],
      dashLock: 0,
      wasDashing: false,
      dashHits: new Set(),
      stowed: new Map(),
      wasFiring: false,
      weaponDiscounts: 0,
      barricadeDiscounts: 0,
      turretDiscounts: 0,
      lastStandReady: true,
      pushX: 0,
      pushY: 0,
    });
    this.build.resetDiscounts(client.sessionId);
    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
    this.broadcastSnapshot();
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.world.runtime.delete(client.sessionId);
    if (this.state.hostSessionId === client.sessionId) {
      this.state.hostSessionId = this.state.players.keys().next().value ?? '';
    }
    if (this.state.phase === 'combat') this.waves.checkDefeat();
    // Nothing counts down any more, so a leaver must not keep the rest waiting.
    if (this.state.phase === 'build' && this.world.everyoneReady()) this.waves.startNextWave();
  }

  /**
   * Upgrades are bought outside the room, so the lobby can hand in a fresh set.
   * Only before the run: mid-run this would be a free power spike.
   */
  private applyLoadout(sessionId: string, options: JoinOptions) {
    if (this.state.phase !== 'lobby') return;
    const player = this.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (!player || !runtime) return;
    runtime.upgrades = this.cleanUpgrades(options.upgrades);
    runtime.perks = this.cleanPerks(options.perks);
    player.maxHealth = Math.round(100 * (1 + runtime.upgrades.maxHealth * 0.02));
    player.health = player.maxHealth;
    player.shieldMax = Math.round(player.maxHealth * SHIELD_SHARE);
    player.shield = 0;
    player.ammo = this.playerSystem.magazineSize(player.weapon, runtime.upgrades);
    player.reserveAmmo = reserveCapacity(player.weapon, runtime.upgrades.reserveAmmo);
    player.dashMax = this.playerSystem.maxDashes(runtime.upgrades);
    player.dashCharges = player.dashMax;
    player.grenades = this.playerSystem.maxGrenades(runtime.perks);
    this.build.resetDiscounts(sessionId);
    this.broadcastSnapshot();
  }

  // ---------------------------------------------------------------- map setup

  /** Map and mode are the host's call, and only outside a running run. */
  private mayChangeSetup(sessionId: string) {
    if (sessionId !== this.state.hostSessionId) return false;
    return this.state.phase === 'lobby' || this.state.phase === 'gameover';
  }

  private applyMap(mapId: string) {
    this.world.map = findMap(mapId);
    this.state.mapId = this.world.map.id;
    // An endless run has no total, so the client can show it as such.
    this.state.totalWaves = this.state.endless ? 0 : this.world.map.waves.length;
    if (this.state.phase === 'lobby') {
      this.state.statusText = this.state.endless
        ? `${this.world.map.name} · Endlos`
        : `${this.world.map.name} · ${this.world.map.waves.length} Wellen`;
    }
  }

  // -------------------------------------------------------------- simulation

  private update(deltaMs: number) {
    const delta = Math.min(deltaMs, 100) / 1000;
    if (this.state.phase === 'combat') this.updateCombat(delta);
    if (this.state.phase === 'build') this.playerSystem.update(delta);

    this.snapshotElapsed += deltaMs;
    // Big hordes push a lot of JSON, so send slightly fewer frames then and let
    // the client interpolate the gap.
    const snapshotInterval =
      this.state.phase === 'combat' ? (this.state.zombies.size > 55 ? 100 : 75) : 150;
    if (this.snapshotElapsed >= snapshotInterval) {
      this.snapshotElapsed %= snapshotInterval;
      this.broadcastSnapshot();
    }
  }

  private updateCombat(delta: number) {
    this.waves.spawn(delta);
    this.playerSystem.update(delta);
    this.zombieSystem.update(delta);
    this.projectiles.update(delta);
    this.turrets.update(delta);
    this.abilities.updateHazards(delta);
    this.playerSystem.updateRevives(delta);
    this.abilities.updateBossBar();
    this.state.enemiesRemaining = this.waves.enemiesLeft();

    if (!this.waves.checkDefeat() && this.waves.enemiesLeft() === 0) this.waves.finishWave();
  }

  // -------------------------------------------------------------- networking

  private broadcastSnapshot() {
    if (this.clients.length === 0) {
      this.world.fxQueue.length = 0;
      return;
    }
    const payload = this.state.toJSON() as Record<string, unknown>;
    this.compact(payload['players'], PLAYER_PRECISION);
    this.compact(payload['zombies'], ZOMBIE_PRECISION);
    this.compact(payload['projectiles'], PROJECTILE_PRECISION);
    this.compact(payload['defenses'], DEFENSE_PRECISION);
    this.compact(payload['hazards'], HAZARD_PRECISION);
    if (this.world.fxQueue.length > 0) payload['fx'] = this.world.fxQueue;
    this.broadcast('snapshot', payload);
    this.world.fxQueue = [];
  }

  /** Trims float noise so a full snapshot stays small on slow connections. */
  private compact(group: unknown, decimals: Record<string, number>) {
    if (!group || typeof group !== 'object') return;
    for (const entity of Object.values(group as Record<string, Record<string, unknown>>)) {
      for (const key in decimals) {
        const value = entity[key];
        if (typeof value !== 'number') continue;
        const factor = decimals[key];
        entity[key] = factor === 1 ? Math.round(value) : Math.round(value * factor) / factor;
      }
    }
  }

  // ------------------------------------------------------------------ input

  private cleanInput(input: Partial<PlayerInput>): PlayerInput {
    return {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      shoot: Boolean(input.shoot),
      reload: Boolean(input.reload),
      dash: Boolean(input.dash),
      aimX: this.clamp(Number(input.aimX) || 0, 0, ARENA.width),
      aimY: this.clamp(Number(input.aimY) || 0, 0, ARENA.height),
    };
  }

  private cleanUpgrades(upgrades?: Partial<PermanentUpgrades>): PermanentUpgrades {
    return Object.fromEntries(
      Object.keys(EMPTY_UPGRADES).map((key) => [
        key,
        this.clamp(
          Math.floor(Number(upgrades?.[key as UpgradeKey]) || 0),
          0,
          upgradeMaxLevel(key as UpgradeKey),
        ),
      ]),
    ) as unknown as PermanentUpgrades;
  }

  private cleanPerks(perks?: Partial<PermanentPerks>): PermanentPerks {
    return Object.fromEntries(
      Object.keys(EMPTY_PERKS).map((key) => [
        key,
        Boolean(perks?.[key as keyof PermanentPerks]),
      ]),
    ) as unknown as PermanentPerks;
  }

  private cleanName(name?: string) {
    const clean = String(name ?? 'Überlebender')
      .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
      .trim()
      .slice(0, 18);
    return clean || 'Überlebender';
  }

  private cleanCode(code?: string) {
    return String(code ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  // ------------------------------------------------------- headless test API

  /** Handles the sim script and tests use to drive a room without a network. */
  get systems() {
    return {
      world: this.world,
      waves: this.waves,
      build: this.build,
      players: this.playerSystem,
      abilities: this.abilities,
    };
  }
}
