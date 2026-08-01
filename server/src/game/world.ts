import {
  ARENA,
  DEFENSES,
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  MAX_ACTIVE_ZOMBIES,
  PLAYER_RADIUS,
  SUMMON_CYCLES,
  VEHICLES,
  VEHICLE_WRECK_DAMAGE,
  ZOMBIES,
  armorReduction,
  canTurretTarget,
  circleOverlapsVehicle,
  dashReduction,
  endlessDamageScale,
  endlessHealthScale,
  endlessSpeedScale,
  timedAbilities,
  vehicleSellValue,
  type FxEvent,
  type GameMap,
  type HazardKind,
  type MapObstacle,
  type PermanentPerks,
  type PermanentUpgrades,
  type PlayerAbilityType,
  type PlayerInput,
  type WeaponType,
  type ZombieType,
} from '../../../shared/game-types.js';
import {
  DefenseState,
  GameState,
  HazardState,
  PlayerState,
  ProjectileState,
  VehicleState,
  ZombieState,
} from '../state/game-state.js';

export interface AmmoStore {
  ammo: number;
  reserveAmmo: number;
}

export interface RuntimePlayer {
  input: PlayerInput;
  upgrades: PermanentUpgrades;
  perks: PermanentPerks;
  ability: PlayerAbilityType;
  abilityRecharge: number[];
  abilityUseLock: number;
  /** One countdown per spent dash charge. */
  dashRecharge: number[];
  dashLock: number;
  wasDashing: boolean;
  /** Everything the running dash already cut, so nobody is hit twice. */
  dashHits: Set<string>;
  /** Magazine and spare rounds of every weapon that is not in hand. */
  stowed: Map<WeaponType, AmmoStore>;
  wasFiring: boolean;
  /** Held-fire charge and the weapon it belongs to. */
  weaponChargeSeconds: number;
  chargedWeapon: WeaponType | '';
  /** Runtime values for the damaging, fully invulnerable Dashmesser burst. */
  weaponDashSpeed: number;
  weaponDashDamage: number;
  weaponDashArmorPierce: number;
  weaponDashHits: Set<string>;
  /** Discounted purchases the starter perks still have left this run. */
  weaponDiscounts: number;
  barricadeDiscounts: number;
  turretDiscounts: number;
  vehicleDiscounts: number;
  /** Defense selected nearby and allowed to follow the player across the build map. */
  relocatingDefenseId: string;
  lastStandReady: boolean;
  /** Knock-back or pull a boss applied, decays on its own. */
  pushX: number;
  pushY: number;
}

const MAX_FX_PER_SNAPSHOT = 56;
/**
 * Hard ceiling for ground effects. Acid the squad spits out is recycled first,
 * so an emptied magazine can never swallow a boss warning ring.
 */
const MAX_HAZARDS = 60;
/** Extra empty ground between an edge spawn and anything the squad placed. */
const SPAWN_STRUCTURE_CLEARANCE = 120;

export const EMPTY_INPUT: PlayerInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  reload: false,
  dash: false,
  aimX: ARENA.width / 2,
  aimY: ARENA.height / 2,
};

/**
 * Everything the systems share: the authoritative state, the map, per player
 * runtime data and the maths they all need. Systems stay small because the
 * bookkeeping lives here.
 */
export class GameWorld {
  readonly runtime = new Map<string, RuntimePlayer>();
  fxQueue: FxEvent[] = [];
  /** WaveSystem owns the loss transition; the world only reports a destroyed objective. */
  onObjectiveDestroyed?: () => void;
  private entityCounter = 0;

  constructor(
    public state: GameState,
    public map: GameMap,
  ) {}

  // ------------------------------------------------------------------ basics

  clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  nextId(prefix: string) {
    this.entityCounter += 1;
    return `${prefix}${this.entityCounter}`;
  }

  pushFx(event: FxEvent) {
    if (this.fxQueue.length >= MAX_FX_PER_SNAPSHOT) return;
    this.fxQueue.push({
      ...event,
      x: Math.round(event.x),
      y: Math.round(event.y),
      x2: event.x2 === undefined ? undefined : Math.round(event.x2),
      y2: event.y2 === undefined ? undefined : Math.round(event.y2),
    });
  }

  upgradesOf(sessionId: string) {
    return this.runtime.get(sessionId)?.upgrades ?? EMPTY_UPGRADES;
  }

  perksOf(sessionId: string) {
    return this.runtime.get(sessionId)?.perks ?? EMPTY_PERKS;
  }

  /**
   * Enemy health scales with the full map difficulty, damage only with part of
   * it and capped — otherwise the last maps one-shot anyone who has not farmed
   * upgrades for hours.
   */
  damageScale() {
    return Math.min(5.2, 1 + (this.map.difficulty - 1) * 0.7);
  }

  waveDamageScale() {
    return 1 + Math.min(0.5, Math.max(0, this.state.wave - 1) * 0.025);
  }

  /** Shared late multiplier for melee, explosions and boss abilities. */
  endlessDamageMultiplier() {
    return this.state.endless ? endlessDamageScale(this.state.wave) : 1;
  }

  // ----------------------------------------------------------------- spawning

  spawnZombie(type: ZombieType, at?: { x: number; y: number }, edgeSide?: number) {
    const config = ZOMBIES[type];
    const zombie = new ZombieState();
    zombie.id = this.nextId('z');
    zombie.type = type;
    const spawn = at ?? this.edgeSpawn(config.radius, edgeSide);
    zombie.x = spawn.x;
    zombie.y = spawn.y;
    const waveScale = 1 + Math.max(0, this.state.wave - 1) * 0.07;
    const endlessHealth = this.state.endless
      ? endlessHealthScale(this.state.wave, this.state.players.size)
      : 1;
    const missionStrength = this.map.enemyStrength ?? 1;
    zombie.maxHealth = Math.round(
      config.health * waveScale * this.map.difficulty * missionStrength * endlessHealth,
    );
    zombie.health = zombie.maxHealth;
    const endlessSpeed = this.state.endless ? endlessSpeedScale(this.state.wave) : 1;
    zombie.baseSpeed = config.speed * (1 + Math.min(0.3, this.state.wave * 0.012)) * endlessSpeed;
    zombie.speed = zombie.baseSpeed;
    zombie.damage =
      config.damage *
      this.damageScale() *
      missionStrength *
      this.waveDamageScale() *
      this.endlessDamageMultiplier();
    zombie.radius = config.radius;
    zombie.reward = config.reward;
    zombie.armor = config.armor ?? 0;
    zombie.dodgePhase = Math.random() * Math.PI * 2;
    // Abilities start part way through their cycle so a fresh boss does not
    // dump everything the second it appears.
    const abilities = timedAbilities(type);
    zombie.abilityTimers = abilities.map((ability) => ability.every * (0.55 + Math.random() * 0.3));
    // A summoner runs dry eventually, so no wave can be kept alive forever by
    // an enemy that calls in reinforcements faster than they can be cleared.
    zombie.abilityBudget = abilities.map((ability) =>
      ability.kind === 'summon' ? ability.count * SUMMON_CYCLES : Infinity,
    );
    this.state.zombies.set(zombie.id, zombie);
    if (config.rank === 'boss' || config.rank === 'mini') {
      this.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'spawn' });
    }
    return zombie;
  }

  spawnHazard(options: {
    kind: HazardKind;
    x: number;
    y: number;
    r: number;
    life: number;
    damage: number;
    ownerId?: string;
  }) {
    if (this.state.hazards.size >= MAX_HAZARDS) {
      const spare = [...this.state.hazards.values()].find(
        (entry) => entry.kind === 'acid' || entry.kind === 'napalm',
      );
      if (!spare) return undefined;
      this.state.hazards.delete(spare.id);
    }
    const hazard = new HazardState();
    hazard.id = this.nextId('h');
    hazard.kind = options.kind;
    hazard.x = Math.round(this.clamp(options.x, 20, ARENA.width - 20));
    hazard.y = Math.round(this.clamp(options.y, 20, ARENA.height - 20));
    hazard.r = Math.round(options.r);
    hazard.life = options.life;
    hazard.maxLife = options.life;
    hazard.damage = options.damage;
    hazard.ownerId = options.ownerId ?? '';
    this.state.hazards.set(hazard.id, hazard);
    return hazard;
  }

  createProjectile(
    ownerId: string,
    x: number,
    y: number,
    angle: number,
    damage: number,
    speed: number,
    kind: string,
  ) {
    const projectile = new ProjectileState();
    projectile.id = this.nextId('p');
    projectile.ownerId = ownerId;
    projectile.kind = kind;
    projectile.x = x;
    projectile.y = y;
    projectile.vx = Math.cos(angle) * speed;
    projectile.vy = Math.sin(angle) * speed;
    projectile.damage = damage;
    projectile.life = 1.2;
    this.state.projectiles.set(projectile.id, projectile);
    return projectile;
  }

  atZombieCap() {
    return this.state.zombies.size >= MAX_ACTIVE_ZOMBIES;
  }

  playerSpawn(index: number) {
    const angle = (Math.PI * 2 * index) / 4;
    return {
      x: ARENA.width / 2 + Math.cos(angle) * 70,
      y: ARENA.height / 2 + Math.sin(angle) * 70,
    };
  }

  /**
   * Enemies enter from just outside the arena. Prefer an entry lane without
   * buildings or players, so every corner remains useful for defenses and no
   * enemy appears inside somebody's fortification.
   */
  edgeSpawn(radius = ZOMBIES.normal.radius, forcedSide?: number) {
    const randomCandidate = () =>
      this.edgeSpawnCandidate(forcedSide ?? Math.floor(Math.random() * 4), Math.random(), radius);

    const start = Math.floor(Math.random() * 64);
    for (const avoidPlayers of [true, false]) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = randomCandidate();
        if (this.spawnLaneClear(candidate, radius, avoidPlayers)) return candidate;
      }
      // A fixed sweep catches narrow free gaps that the random attempts missed.
      for (let index = 0; index < 64; index += 1) {
        const slot = (start + index * 17) % 64;
        const candidate = this.edgeSpawnCandidate(
          forcedSide ?? Math.floor(slot / 16),
          ((slot % 16) + 0.5) / 16,
          radius,
        );
        if (this.spawnLaneClear(candidate, radius, avoidPlayers)) return candidate;
      }
    }

    // Even a completely walled-off edge must not freeze a wave. Spawning just
    // outside lets that enemy attack its way through instead of overlapping it.
    return randomCandidate();
  }

  private edgeSpawnCandidate(side: number, offset: number, radius: number) {
    const outside = radius + 24;
    const edgeMargin = 50;
    const vertical = edgeMargin + offset * (ARENA.height - edgeMargin * 2);
    const horizontal = edgeMargin + offset * (ARENA.width - edgeMargin * 2);
    if (side === 0) return { x: -outside, y: vertical };
    if (side === 1) return { x: ARENA.width + outside, y: vertical };
    if (side === 2) return { x: horizontal, y: -outside };
    return { x: horizontal, y: ARENA.height + outside };
  }

  private spawnLaneClear(
    candidate: { x: number; y: number },
    radius: number,
    avoidPlayers: boolean,
  ) {
    const entryX = this.clamp(candidate.x, 12, ARENA.width - 12);
    const entryY = this.clamp(candidate.y, 12, ARENA.height - 12);
    if (!this.canStand(entryX, entryY, radius + 10)) return false;
    for (const defense of this.state.defenses.values()) {
      if (this.circleOverlapsDefense(entryX, entryY, radius + SPAWN_STRUCTURE_CLEARANCE, defense)) {
        return false;
      }
    }
    for (const vehicle of this.state.vehicles.values()) {
      if (circleOverlapsVehicle(entryX, entryY, radius + SPAWN_STRUCTURE_CLEARANCE, vehicle)) {
        return false;
      }
    }
    if (!avoidPlayers) return true;
    return this.livingPlayers().every(
      (player) => Math.hypot(player.x - entryX, player.y - entryY) >= radius + PLAYER_RADIUS + 180,
    );
  }

  // ------------------------------------------------------------------- damage

  igniteZombie(zombie: ZombieState, dps: number, seconds: number, ownerId: string) {
    zombie.burnDps = Math.max(zombie.burnDps, dps);
    zombie.burning = Math.max(zombie.burning, seconds);
    if (ownerId) zombie.lastAttacker = ownerId;
  }

  /**
   * Frost stacks by strength, not by count: the hardest slow wins and refreshes
   * the timer, so emptying a magazine cannot freeze a horde in place forever.
   */
  chillZombie(zombie: ZombieState, slow: number, seconds: number) {
    const factor = 1 - slow;
    zombie.slowFactor = zombie.chilled > 0 ? Math.min(zombie.slowFactor, factor) : factor;
    zombie.chilled = Math.max(zombie.chilled, seconds);
  }

  damageZombie(id: string, zombie: ZombieState, amount: number, ownerId: string, armorPierce = 0) {
    const remainingArmor = zombie.armor * (1 - this.clamp(armorPierce, 0, 1));
    const dealt = Math.max(0, amount * (1 - remainingArmor));
    zombie.health -= dealt;
    if (ownerId && this.state.players.has(ownerId)) {
      zombie.damageBy.set(ownerId, (zombie.damageBy.get(ownerId) ?? 0) + dealt);
      zombie.lastAttacker = ownerId;
    }
    if (zombie.health <= 0) {
      this.killZombie(id, zombie);
      return;
    }
    const dodge = ZOMBIES[zombie.type].hitDodge;
    if (dealt > 0 && dodge && zombie.hitDodgeCooldown <= 0) {
      zombie.hitDodgeCooldown = dodge.cooldown;
      this.dodgeZombie(zombie, dodge.distance);
    }
  }

  /** A hit-reactive enemy jumps sideways to the first unobstructed landing spot. */
  private dodgeZombie(zombie: ZombieState, distance: number) {
    const start = zombie.rotation + Math.PI / 2;
    const directions = [
      0,
      Math.PI,
      Math.PI / 4,
      -Math.PI / 4,
      (Math.PI * 3) / 4,
      (-Math.PI * 3) / 4,
    ];
    for (const offset of directions) {
      const angle = start + offset;
      const x = this.clamp(zombie.x + Math.cos(angle) * distance, 12, ARENA.width - 12);
      const y = this.clamp(zombie.y + Math.sin(angle) * distance, 12, ARENA.height - 12);
      if (!this.canTravel(zombie.x, zombie.y, x, y, zombie.radius)) continue;
      this.pushFx({ k: 'dash', x: zombie.x, y: zombie.y, x2: x, y2: y, a: angle, s: zombie.type });
      zombie.x = x;
      zombie.y = y;
      return;
    }
  }

  healZombie(zombie: ZombieState, amount: number) {
    zombie.health = Math.min(zombie.maxHealth, zombie.health + amount);
  }

  /** `payout` is off when a zombie removes itself, e.g. an exploder on impact. */
  killZombie(id: string, zombie: ZombieState, payout = true) {
    if (!this.state.zombies.has(id)) return;
    this.state.zombies.delete(id);
    this.pushFx({ k: 'death', x: zombie.x, y: zombie.y, r: zombie.radius, s: zombie.type });
    if (payout) this.payKill(zombie);
    this.onZombieKilled?.(zombie);
  }

  /** Set by the zombie system so a dying enemy can explode or split. */
  onZombieKilled?: (zombie: ZombieState) => void;

  /**
   * The whole reward is split evenly, no matter who shot: someone who only
   * builds barricades or patches up the squad earns exactly as much as the one
   * behind the gun.
   */
  private payKill(zombie: ZombieState) {
    const players = [...this.state.players.values()];
    if (players.length === 0) return;
    const share = Math.round(
      (zombie.reward * this.map.moneyScale * (this.map.ingameMoneyScale ?? 1)) / players.length,
    );

    let bestId = '';
    let bestDamage = 0;
    for (const player of players) {
      player.money += share;
      const dealt = zombie.damageBy.get(player.id) ?? 0;
      if (dealt > bestDamage) {
        bestDamage = dealt;
        bestId = player.id;
      }
    }
    // The kill goes on the account of whoever hurt it most, not the last shot.
    const scorer = bestId ? this.state.players.get(bestId) : undefined;
    if (scorer) scorer.kills += 1;
  }

  /** Tells the caller whether the blow landed, so a dodge can look different. */
  damagePlayer(player: PlayerState, amount: number) {
    if (!player.alive) return false;
    // While a seat and its hull still exist, every attack lands on the vehicle
    // instead of the passenger. Wreck damage is applied only after everyone
    // has been dropped out and their vehicleId has been cleared.
    if (this.vehicleOf(player.id)) return false;
    if (player.weaponDashing > 0) return false;
    const runtime = this.runtime.get(player.id);
    const upgrades = runtime?.upgrades ?? EMPTY_UPGRADES;
    let reduction = 1 - armorReduction(upgrades.armor);
    // A dash swallows a good part of every blow, and the levelled upgrade pushes
    // that up to the full immunity it used to hand out for nothing.
    if (player.dashing > 0) {
      const dodged = dashReduction(upgrades.dashResist);
      if (dodged >= 1) return false;
      reduction *= 1 - dodged;
    }
    let incoming = amount * reduction;
    player.hurt = 0.35;
    // The dash shield takes the blow first, only the rest reaches the body.
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, incoming);
      player.shield -= absorbed;
      incoming -= absorbed;
    }
    const next = player.health - incoming;
    if (next <= 0 && runtime?.perks.lastStand && runtime.lastStandReady) {
      runtime.lastStandReady = false;
      player.health = 1;
      this.pushFx({ k: 'heal', x: player.x, y: player.y, s: 'laststand' });
      return true;
    }
    player.health = Math.max(0, next);
    if (player.health <= 0) {
      player.alive = false;
      player.reviveProgress = 0;
      // Nobody can be picked up out of a seat, so a downed driver rolls out.
      this.leaveVehicle(player);
      this.pushFx({ k: 'blood', x: player.x, y: player.y, r: 40, s: 'down' });
    }
    return true;
  }

  damageStructures(x: number, y: number, radius: number, damage: number) {
    const broken: DefenseState[] = [];
    this.state.defenses.forEach((defense) => {
      const distance = Math.hypot(defense.x - x, defense.y - y);
      if (distance > radius) return;
      defense.health -= damage * Math.max(0.3, 1 - distance / radius);
      this.pushFx({ k: 'structure', x: defense.x, y: defense.y, s: defense.type });
      if (defense.health <= 0) broken.push(defense);
    });
    for (const defense of broken) this.destroyDefense(defense);

    const hulls: VehicleState[] = [];
    this.state.vehicles.forEach((vehicle) => {
      const distance = Math.hypot(vehicle.x - x, vehicle.y - y);
      if (distance > radius) return;
      hulls.push(vehicle);
    });
    for (const vehicle of hulls) {
      const distance = Math.hypot(vehicle.x - x, vehicle.y - y);
      this.damageVehicle(vehicle, damage * Math.max(0.3, 1 - distance / radius));
    }

    const state = this.state;
    if (state.objectiveActive) {
      if (state.objectiveCores.size > 0) {
        state.objectiveCores.forEach((core) => {
          const distance = Math.hypot(core.x - x, core.y - y);
          if (distance <= radius + core.radius) {
            this.damageObjective(damage * Math.max(0.3, 1 - distance / radius), core.id);
          }
        });
      } else {
        const distance = Math.hypot(state.objectiveX - x, state.objectiveY - y);
        if (distance <= radius + state.objectiveRadius) {
          this.damageObjective(damage * Math.max(0.3, 1 - distance / radius));
        }
      }
    }
  }

  /** Closest live mission target, including independently defended relay cores. */
  nearestObjective(x: number, y: number) {
    const state = this.state;
    if (!state.objectiveActive) return undefined;
    if (state.objectiveCores.size === 0) {
      return {
        id: '',
        x: state.objectiveX,
        y: state.objectiveY,
        radius: state.objectiveRadius,
      };
    }
    let best: { id: string; x: number; y: number; radius: number } | undefined;
    let bestDistance = Infinity;
    state.objectiveCores.forEach((core) => {
      if (core.health <= 0) return;
      const distance = Math.hypot(core.x - x, core.y - y);
      if (distance >= bestDistance) return;
      bestDistance = distance;
      best = { id: core.id, x: core.x, y: core.y, radius: core.radius };
    });
    return best;
  }

  damageObjective(amount: number, coreId = '') {
    const state = this.state;
    if (!state.objectiveActive || amount <= 0 || state.objectiveHealth <= 0) return;
    // Mission structures are fortified targets, not oversized players. Their
    // armor keeps one leaked pack from deleting a long campaign in seconds.
    if (state.objectiveCores.size > 0) {
      const core = coreId ? state.objectiveCores.get(coreId) : undefined;
      if (!core || core.health <= 0) return;
      core.health = Math.max(0, core.health - amount * 0.0015);
      state.objectiveHealth = [...state.objectiveCores.values()].reduce(
        (sum, entry) => sum + entry.health,
        0,
      );
      this.pushFx({
        k: 'structure',
        x: core.x,
        y: core.y,
        r: core.radius,
        s: 'multiholdout',
      });
      if (core.health <= 0) this.onObjectiveDestroyed?.();
      return;
    }
    state.objectiveHealth = Math.max(0, state.objectiveHealth - amount * 0.0015);
    this.pushFx({
      k: 'structure',
      x: state.objectiveX,
      y: state.objectiveY,
      r: state.objectiveRadius,
      s: state.objectiveKind,
    });
    if (state.objectiveHealth <= 0) this.onObjectiveDestroyed?.();
  }

  /** Objectives reserve their own footprint just like a map prop. */
  objectiveClear(x: number, y: number, radius: number) {
    const state = this.state;
    if (!state.objectiveActive) return true;
    if (state.objectiveCores.size > 0) {
      return [...state.objectiveCores.values()].every(
        (core) => Math.hypot(core.x - x, core.y - y) > core.radius + radius + 24,
      );
    }
    return (
      Math.hypot(state.objectiveX - x, state.objectiveY - y) > state.objectiveRadius + radius + 24
    );
  }

  // ----------------------------------------------------------------- vehicles

  vehicleOf(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || !player.vehicleId) return undefined;
    return this.state.vehicles.get(player.vehicleId);
  }

  damageVehicle(vehicle: VehicleState, amount: number) {
    if (amount <= 0 || !this.state.vehicles.has(vehicle.id)) return;
    vehicle.health -= amount * (1 - vehicle.armor);
    vehicle.refund = vehicleSellValue(vehicle.type, vehicle.health, vehicle.maxHealth);
    this.pushFx({ k: 'structure', x: vehicle.x, y: vehicle.y, s: vehicle.type });
    if (vehicle.health <= 0) this.wreckVehicle(vehicle);
  }

  /** The hull is gone: it takes the crew's health with it and drops them off. */
  wreckVehicle(vehicle: VehicleState) {
    if (!this.state.vehicles.has(vehicle.id)) return;
    const crew = [...vehicle.crew];
    // Empty the seats before anything else: the wreck must not keep firing its
    // gun or handing out first aid for the rest of the tick.
    vehicle.crew.clear();
    this.state.vehicles.delete(vehicle.id);
    const wreckBlast = VEHICLES[vehicle.type].wreckExplosion;
    this.pushFx({
      k: 'explosion',
      x: vehicle.x,
      y: vehicle.y,
      r: wreckBlast?.radius ?? 120,
      s: vehicle.type,
    });
    this.pushFx({ k: 'wreck', x: vehicle.x, y: vehicle.y, s: vehicle.type });
    if (wreckBlast) {
      const victims = [...this.state.zombies.entries()];
      for (const [id, zombie] of victims) {
        const distance = Math.hypot(zombie.x - vehicle.x, zombie.y - vehicle.y);
        if (distance > wreckBlast.radius + zombie.radius) continue;
        const falloff = Math.max(0.42, 1 - distance / (wreckBlast.radius + zombie.radius));
        this.damageZombie(id, zombie, wreckBlast.damage * falloff, vehicle.ownerId);
      }
    }
    for (const id of crew) {
      const passenger = this.state.players.get(id);
      if (!passenger) continue;
      passenger.vehicleId = '';
      this.dropOffPlayer(passenger, vehicle);
      this.damagePlayer(passenger, VEHICLE_WRECK_DAMAGE * this.endlessDamageMultiplier());
    }
  }

  /** Takes a player out of their seat and puts them down beside the hull. */
  leaveVehicle(player: PlayerState) {
    const vehicle = this.vehicleOf(player.id);
    player.vehicleId = '';
    if (!vehicle) return;
    const index = vehicle.crew.indexOf(player.id);
    if (index >= 0) vehicle.crew.splice(index, 1);
    this.dropOffPlayer(player, vehicle);
    this.pushFx({ k: 'engine', x: vehicle.x, y: vehicle.y, s: vehicle.type });
  }

  /** Puts a player back on their feet beside the hull, on a spot they can stand on. */
  dropOffPlayer(player: PlayerState, vehicle: VehicleState) {
    const config = VEHICLES[vehicle.type];
    const distance = config.height / 2 + PLAYER_RADIUS + 8;
    for (let step = 0; step < 8; step += 1) {
      const angle = vehicle.rotation + Math.PI / 2 + (step * Math.PI) / 4;
      const x = this.clamp(
        vehicle.x + Math.cos(angle) * distance,
        ARENA.padding,
        ARENA.width - ARENA.padding,
      );
      const y = this.clamp(
        vehicle.y + Math.sin(angle) * distance,
        ARENA.padding,
        ARENA.height - ARENA.padding,
      );
      if (!this.canStand(x, y, PLAYER_RADIUS)) continue;
      player.x = x;
      player.y = y;
      return;
    }
    player.x = vehicle.x;
    player.y = vehicle.y;
  }

  /** A blow against the hull cannot reach the crew while the hull survives. */
  hullMelee(vehicle: VehicleState, damage: number, attackerX?: number, attackerY?: number) {
    const directional = VEHICLES[vehicle.type].directionalArmor;
    if (!directional || attackerX === undefined || attackerY === undefined) {
      this.damageVehicle(vehicle, damage);
      return;
    }
    let difference = Math.atan2(attackerY - vehicle.y, attackerX - vehicle.x) - vehicle.rotation;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    const multiplier =
      Math.abs(difference) <= directional.frontArc / 2 ? directional.front : directional.exposed;
    this.damageVehicle(vehicle, damage * multiplier);
  }

  blockingVehicle(x: number, y: number, radius: number) {
    for (const vehicle of this.state.vehicles.values()) {
      if (circleOverlapsVehicle(x, y, radius, vehicle)) return vehicle;
    }
    return undefined;
  }

  /** Enemy damage breaks a structure and triggers any last-resort effect it has. */
  destroyDefense(defense: DefenseState) {
    if (!this.state.defenses.has(defense.id)) return;
    this.state.defenses.delete(defense.id);
    this.pushFx({ k: 'wreck', x: defense.x, y: defense.y, s: defense.type });
    const config = DEFENSES[defense.type];
    if (!config.blastRadius || !config.blastDamage) return;

    this.pushFx({
      k: 'explosion',
      x: defense.x,
      y: defense.y,
      r: config.blastRadius,
      s: defense.type,
    });
    const victims = [...this.state.zombies.entries()].filter(
      ([, zombie]) =>
        Math.hypot(zombie.x - defense.x, zombie.y - defense.y) <=
        config.blastRadius! + zombie.radius,
    );
    for (const [id, zombie] of victims) {
      const distance = Math.hypot(zombie.x - defense.x, zombie.y - defense.y);
      const falloff = Math.max(0.35, 1 - distance / (config.blastRadius + zombie.radius));
      this.damageZombie(id, zombie, config.blastDamage * falloff, defense.ownerId);
    }
  }

  /** Area hit that catches players and their buildings alike. */
  blast(x: number, y: number, radius: number, damage: number, structureFactor = 1.2) {
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance > radius) return;
      this.damagePlayer(player, damage * Math.max(0.35, 1 - distance / radius));
    });
    this.damageStructures(x, y, radius, damage * structureFactor);
  }

  // ------------------------------------------------------------------ lookups

  nearestLivingPlayer(x: number, y: number) {
    let best: PlayerState | undefined;
    let bestDistance = Infinity;
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    });
    return best;
  }

  livingPlayers() {
    return [...this.state.players.values()].filter((player) => player.alive);
  }

  nearestZombie(x: number, y: number, range: number, requireSight = false) {
    return this.nearestZombies(x, y, range, 1, requireSight)[0];
  }

  /** Automated structures cannot acquire cloaked enemies, although their shots may still hit. */
  nearestTurretTargets(x: number, y: number, range: number, limit: number, requireSight = false) {
    return this.nearestZombies(x, y, range, limit, requireSight, (zombie) =>
      canTurretTarget(zombie.type),
    );
  }

  /** Closest visible targets, used by turrets that can engage several enemies. */
  nearestZombies(
    x: number,
    y: number,
    range: number,
    limit: number,
    requireSight = false,
    eligible: (zombie: ZombieState) => boolean = () => true,
  ) {
    const candidates: Array<{ zombie: ZombieState; distance: number }> = [];
    this.state.zombies.forEach((zombie) => {
      if (!eligible(zombie)) return;
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance > range) return;
      if (requireSight && !this.hasLineOfSight(x, y, zombie.x, zombie.y)) return;
      candidates.push({ zombie, distance });
    });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, Math.max(1, limit)).map(({ zombie }) => zombie);
  }

  everyoneReady() {
    return (
      this.state.players.size > 0 &&
      [...this.state.players.values()].every((player) => player.ready)
    );
  }

  // --------------------------------------------------------------- collisions

  canStand(x: number, y: number, radius: number) {
    for (const obstacle of this.map.obstacles) {
      if (this.circleOverlapsRect(x, y, radius, obstacle)) return false;
    }
    return true;
  }

  /**
   * Continuous-enough body sweep for fast movers. Sampling at a fraction of
   * the body radius prevents a thin obstacle from fitting between two checks.
   */
  canTravel(x1: number, y1: number, x2: number, y2: number, radius: number) {
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const stride = Math.max(4, radius * 0.25);
    const steps = Math.max(1, Math.ceil(distance / stride));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      if (!this.canStand(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress, radius)) {
        return false;
      }
    }
    return true;
  }

  circleOverlapsRect(x: number, y: number, radius: number, rect: MapObstacle) {
    const closestX = this.clamp(x, rect.x - rect.w / 2, rect.x + rect.w / 2);
    const closestY = this.clamp(y, rect.y - rect.h / 2, rect.y + rect.h / 2);
    return Math.hypot(x - closestX, y - closestY) < radius;
  }

  circleOverlapsDefense(x: number, y: number, radius: number, defense: DefenseState) {
    const config = DEFENSES[defense.type];
    if (config.kind === 'turret') {
      return Math.hypot(x - defense.x, y - defense.y) < radius + config.width / 2 - 4;
    }
    const cos = Math.cos(-defense.rotation);
    const sin = Math.sin(-defense.rotation);
    const dx = x - defense.x;
    const dy = y - defense.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const closestX = this.clamp(localX, -config.width / 2, config.width / 2);
    const closestY = this.clamp(localY, -config.height / 2, config.height / 2);
    return Math.hypot(localX - closestX, localY - closestY) < radius;
  }

  blockingDefense(zombie: ZombieState, dx: number, dy: number) {
    return [...this.state.defenses.values()].find(
      (defense) =>
        !DEFENSES[defense.type].passable &&
        this.circleOverlapsDefense(zombie.x + dx, zombie.y + dy, zombie.radius, defense),
    );
  }

  /**
   * How far along the segment a circle is met, as a share of its length, or
   * undefined when it is missed. Used to sort what a bullet meets first.
   */
  segmentCircleAt(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    radius: number,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(cx - x1, cy - y1) <= radius ? 0 : undefined;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lengthSquared;
    t = this.clamp(t, 0, 1);
    const distance = Math.hypot(cx - (x1 + dx * t), cy - (y1 + dy * t));
    return distance <= radius ? t : undefined;
  }

  segmentHitsCircle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    radius: number,
  ) {
    return this.segmentCircleAt(x1, y1, x2, y2, cx, cy, radius) !== undefined;
  }

  /** Same idea for walls: where the segment first enters a solid obstacle. */
  obstacleHitAt(x1: number, y1: number, x2: number, y2: number) {
    let best: number | undefined;
    for (const rect of this.map.obstacles) {
      if (!rect.solid) continue;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (
        maxX < rect.x - rect.w / 2 ||
        minX > rect.x + rect.w / 2 ||
        maxY < rect.y - rect.h / 2 ||
        minY > rect.y + rect.h / 2
      ) {
        continue;
      }
      const at = this.segmentEntersRect(x1, y1, x2, y2, rect);
      if (at === undefined) continue;
      if (best === undefined || at < best) best = at;
    }
    return best;
  }

  segmentHitsObstacle(x1: number, y1: number, x2: number, y2: number) {
    return this.obstacleHitAt(x1, y1, x2, y2) !== undefined;
  }

  private segmentEntersRect(x1: number, y1: number, x2: number, y2: number, rect: MapObstacle) {
    const left = rect.x - rect.w / 2;
    const right = rect.x + rect.w / 2;
    const top = rect.y - rect.h / 2;
    const bottom = rect.y + rect.h / 2;
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return 0;

    let tMin = 0;
    let tMax = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const slabs: Array<[number, number, number]> = [
      [dx, left - x1, right - x1],
      [dy, top - y1, bottom - y1],
    ];
    for (const [delta, near, far] of slabs) {
      if (Math.abs(delta) < 1e-6) {
        if (near > 0 || far < 0) return undefined;
        continue;
      }
      let t1 = near / delta;
      let t2 = far / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return undefined;
    }
    return tMin;
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number) {
    return !this.segmentHitsObstacle(x1, y1, x2, y2);
  }
}
