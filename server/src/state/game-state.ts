import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import type {
  DefenseType,
  GamePhase,
  HazardKind,
  VehicleType,
  WaveKind,
  WeaponType,
  ZombieType,
  PlayerAbilityType,
} from '../../../shared/game-types.js';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') color = '#69f0ae';
  @type('number') x = 640;
  @type('number') y = 360;
  @type('number') rotation = 0;
  @type('number') health = 100;
  @type('number') maxHealth = 100;
  /** Dash shield that soaks damage before health, and what fits at most. */
  @type('number') shield = 0;
  @type('number') shieldMax = 0;
  @type('boolean') alive = true;
  @type('number') money = 400;
  @type('string') weapon: WeaponType = 'pistol';
  @type(['string']) owned = new ArraySchema<string>('pistol');
  /** Current sale value per bought weapon, after accounting for missing rounds. */
  @type({ map: 'number' }) weaponRefunds = new MapSchema<number>();
  @type('number') ammo = 12;
  @type('number') reserveAmmo = 96;
  /** The one tool fired with G, its ready charges and next recharge. */
  @type('string') ability: PlayerAbilityType = 'grenade';
  @type('number') abilityCharges = 3;
  @type('number') abilityMax = 3;
  @type('number') abilityCooldown = 0;
  @type('number') dashCharges = 2;
  @type('number') dashMax = 2;
  /** Seconds left of the current dash — above zero means damage is reduced. */
  @type('number') dashing = 0;
  @type('number') dashCooldown = 0;
  /** Discounted buys the starter perks still have left this run. */
  @type('number') weaponDiscount = 0;
  @type('number') barricadeDiscount = 0;
  @type('number') turretDiscount = 0;
  @type('number') vehicleDiscount = 0;
  /** Id of the vehicle this player sits in, empty while on foot. */
  @type('string') vehicleId = '';
  @type('boolean') ready = false;
  @type('number') kills = 0;
  @type('number') reviveProgress = 0;
  @type('number') reloading = 0;
  @type('number') firing = 0;
  /** Visible charge of the Blitzhammer or Dashmesser, from zero to one. */
  @type('number') weaponCharge = 0;
  @type('number') hurt = 0;
  fireCooldown = 0;
  dashDirX = 1;
  dashDirY = 0;
  /** Full immunity is exclusive to the charged Dashmesser attack. */
  weaponDashing = 0;
}

export class ZombieState extends Schema {
  @type('string') id = '';
  @type('string') type: ZombieType = 'normal';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') health = 50;
  @type('number') maxHealth = 50;
  @type('number') rotation = 0;
  @type('number') burning = 0;
  /** Seconds left of a slow — the frost counterpart to `burning`. */
  @type('number') chilled = 0;
  @type('number') attacking = 0;
  @type('number') charging = 0;
  /** Above zero while a telegraphed attack is winding up. */
  @type('number') casting = 0;
  /** Seconds left of a temporary all-round projectile shield. */
  @type('number') shielding = 0;
  speed = 70;
  baseSpeed = 70;
  damage = 12;
  radius = 18;
  reward = 12;
  armor = 0;
  attackCooldown = 0;
  stuckTimer = 0;
  bestDistance = Infinity;
  /** Stable side used while steering around an obstacle, avoids left/right jitter. */
  avoidSide = 1;
  /** Individual offset for enemies that weave across their route. */
  dodgePhase = 0;
  /** A hit-reactive Sprunghetzer may dodge again when this reaches zero. */
  hitDodgeCooldown = 0;
  /** Temporary grid route around map geometry; authoritative but not networked. */
  path: Array<{ x: number; y: number }> = [];
  pathTargetX = 0;
  pathTargetY = 0;
  lastAttacker = '';
  burnDps = 0;
  slowFactor = 1;
  hasteTimer = 0;
  hasteFactor = 1;
  chargeSpeed = 0;
  /** One countdown per timed ability of this zombie type. */
  abilityTimers: number[] = [];
  /** Minions this zombie may still call in, one entry per timed ability. */
  abilityBudget: number[] = [];
  /** Damage every player dealt, so the reward can be split fairly. */
  damageBy = new Map<string, number>();
}

export class ProjectileState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') kind = 'bullet';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  damage = 10;
  radius = 4;
  life = 1.2;
  pierce = 0;
  splashRadius = 0;
  splashDamage = 0;
  chain = 0;
  chainRange = 0;
  burn = 0;
  burnSeconds = 0;
  /** Acid puddle left where this shot bursts. */
  acidRadius = 0;
  acidDps = 0;
  acidSeconds = 0;
  slow = 0;
  slowSeconds = 0;
  /** Missing-health multiplier used only by the one-target ability shot. */
  execute = 0;
  /** Upgrade levels that turn part of the victim's maximum health into bonus damage. */
  precisionHealthDamageLevel = 0;
  /** The Todesurteil perk reduces this ability's cooldown after a killing blow. */
  reduceAbilityCooldownOnKill = false;
  pull = 0;
  lightningEvery = 0;
  lightningTimer = 0;
  lightningRange = 0;
  lightningDamage = 0;
  lightningTargets = 0;
  hitIds = new Set<string>();
}

/** One independently destructible target of a multi-core defense mission. */
export class ObjectiveCoreState extends Schema {
  @type('string') id = '';
  @type('string') label = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') radius = 0;
  @type('number') health = 0;
  @type('number') maxHealth = 0;
}

export class DefenseState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') type: DefenseType = 'wood';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') health = 100;
  @type('number') maxHealth = 100;
  @type('number') rotation = 0;
  /** Effective turret range, including the owner's permanent upgrades. */
  @type('number') range = 0;
  /** What selling pays right now, based on original price and current health. */
  @type('number') refund = 0;
  cooldown = 0;
  /** Server-only lock used by the Omega-Fokus damage ramp. */
  focusTargetId = '';
  focusHits = 0;
}

/** A hull the squad can get into: it drives, rams and soaks damage for its crew. */
export class VehicleState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') type: VehicleType = 'car';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') rotation = 0;
  @type('number') health = 100;
  @type('number') maxHealth = 100;
  /** Damage reduction baked in when the owner places this vehicle. */
  armor = 0;
  /** What selling pays right now, based on original price and current health. */
  @type('number') refund = 0;
  /** Session ids on board, the first one is driving. */
  @type(['string']) crew = new ArraySchema<string>();
  @type('number') vx = 0;
  @type('number') vy = 0;
  cooldown = 0;
  /** Seconds of nitro left; the browser predicts the same burst locally. */
  boost = 0;
  /** Cooldown per zombie, so driving through a horde is not a per-tick shredder. */
  ramCooldowns = new Map<string, number>();
  /** Fractional rounds and health the aura effects hand out over time. */
  resupplyRest = 0;
}

/**
 * A drone of a hangar. It flies on its own and shoots, but nothing can hurt it:
 * it lives and dies with the building that launched it.
 */
export class DroneState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') rotation = 0;
  /** Building this drone belongs to; it is removed with it. */
  hangarId = '';
  /** Which of the hangar's drones this is, so they spread out and pick apart. */
  slot = 0;
  cooldown = 0;
  /** Own angle on the circle it flies, so the three never overlap. */
  phase = 0;
}

/**
 * Ground effects: red warning rings that go off when they run out, and the
 * burning or toxic pools a boss leaves behind.
 */
export class HazardState extends Schema {
  @type('string') id = '';
  @type('string') kind: HazardKind = 'warning';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') r = 100;
  @type('number') life = 1;
  @type('number') maxLife = 1;
  ownerId = '';
  /** Burst damage for a warning, damage per second for a pool. */
  damage = 0;
  tick = 0;
  /** Friendly fields may keep enemies inside their damaging centre. */
  slow = 0;
  pull = 0;
}

export class GameState extends Schema {
  @type('string') phase: GamePhase = 'lobby';
  @type('string') lobbyCode = '';
  @type('string') hostSessionId = '';
  @type('string') mapId = 'outpost';
  /** Current permanent payout is mirrored so a disconnect can be credited safely. */
  @type('string') runId = '';
  @type('number') runGold = 0;
  @type('boolean') runVictory = false;
  /** Endless run: the waves never stop and no map gets cleared. */
  @type('boolean') endless = false;
  @type('number') wave = 0;
  /** Waves the map has planned, or zero while an endless run is going. */
  @type('number') totalWaves = 10;
  @type('string') waveLabel = 'Welle';
  @type('string') waveKind: WaveKind = 'normal';
  @type('number') enemiesRemaining = 0;
  @type('string') statusText = 'Warte auf Spieler';
  /** Optional campaign objective such as a relay core or escort wagon. */
  @type('boolean') objectiveActive = false;
  @type('string') objectiveKind = '';
  @type('string') objectiveTitle = '';
  @type('number') objectiveX = 0;
  @type('number') objectiveY = 0;
  @type('number') objectiveRadius = 0;
  @type('number') objectiveHealth = 0;
  @type('number') objectiveMaxHealth = 0;
  @type('number') objectiveProgress = 0;
  /** Timed-survival countdown; zero on every regular mission. */
  @type('number') objectiveTimeRemaining = 0;
  @type('number') objectiveDuration = 0;
  @type({ map: ObjectiveCoreState }) objectiveCores = new MapSchema<ObjectiveCoreState>();
  @type('string') bossName = '';
  @type('number') bossHealth = 0;
  @type('number') bossMaxHealth = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: ZombieState }) zombies = new MapSchema<ZombieState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type({ map: DefenseState }) defenses = new MapSchema<DefenseState>();
  @type({ map: VehicleState }) vehicles = new MapSchema<VehicleState>();
  @type({ map: DroneState }) drones = new MapSchema<DroneState>();
  @type({ map: HazardState }) hazards = new MapSchema<HazardState>();
}
