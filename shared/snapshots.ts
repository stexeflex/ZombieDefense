import type { DefenseType } from './defenses.js';
import type { VehicleType } from './vehicles.js';
import type { WeaponType } from './weapons.js';
import type { PlayerAbilityType } from './player-abilities.js';
import type { HazardKind, ZombieType } from './zombies.js';

export type GamePhase = 'lobby' | 'combat' | 'build' | 'gameover';

export type WaveKind = 'normal' | 'mini' | 'swarm' | 'boss';

export type FxKind =
  | 'hit'
  | 'blood'
  /** A blow that ran into a dash and did nothing. */
  | 'deflect'
  | 'death'
  | 'explosion'
  /** Friendly mortar impact area while its shell is in flight. */
  | 'warning'
  | 'burn'
  | 'chain'
  | 'muzzle'
  /** A visible close-range swing from a player weapon. */
  | 'melee'
  | 'structure'
  | 'wreck'
  | 'boss'
  | 'heal'
  | 'dash'
  /** A dash cut through an enemy and charged the shield. */
  | 'shield'
  /** Somebody got in or out of a vehicle. */
  | 'engine';

export interface FxEvent {
  k: FxKind;
  x: number;
  y: number;
  /** optional second point, used by chain lightning */
  x2?: number;
  y2?: number;
  /** radius or size hint */
  r?: number;
  /** angle hint */
  a?: number;
  /** duration hint in seconds */
  d?: number;
  /** subtype, e.g. weapon or zombie type */
  s?: string;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  /** Dash shield that soaks damage before health, and what fits at most. */
  shield: number;
  shieldMax: number;
  alive: boolean;
  money: number;
  weapon: WeaponType;
  /** Every weapon the player bought, in purchase order, pistol first. */
  owned: WeaponType[];
  /** Sale value from the original list price after missing ammunition is counted. */
  weaponRefunds: Partial<Record<WeaponType, number>>;
  ammo: number;
  reserveAmmo: number;
  /** The one tool fired with G, its ready charges and next recharge. */
  ability: PlayerAbilityType;
  abilityCharges: number;
  abilityMax: number;
  abilityCooldown: number;
  /** Dash charges ready right now and the maximum this player can hold. */
  dashCharges: number;
  dashMax: number;
  /** Seconds left of the current dash — above zero means damage is reduced. */
  dashing: number;
  dashCooldown: number;
  /** Discounted buys the starter perks still have left this run. */
  weaponDiscount: number;
  barricadeDiscount: number;
  turretDiscount: number;
  vehicleDiscount: number;
  /** Id of the vehicle this player sits in, empty while on foot. */
  vehicleId: string;
  ready: boolean;
  kills: number;
  reviveProgress: number;
  reloading: number;
  firing: number;
  hurt: number;
}

export interface ZombieSnapshot {
  id: string;
  type: ZombieType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  rotation: number;
  burning: number;
  /** Seconds left of a slow — the frost counterpart to `burning`. */
  chilled: number;
  attacking: number;
  charging: number;
  /** Above zero while a boss is winding up a telegraphed attack. */
  casting: number;
  /** Temporary all-round projectile shield. */
  shielding: number;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface DefenseSnapshot {
  id: string;
  ownerId: string;
  type: DefenseType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  rotation: number;
  /** Effective turret range, including the owner's permanent upgrades. */
  range?: number;
  /** What selling pays right now, based on original price and current health. */
  refund: number;
}

export interface VehicleSnapshot {
  id: string;
  ownerId: string;
  type: VehicleType;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  /** What selling pays right now, based on original price and current health. */
  refund: number;
  /** Session ids on board, the first one is driving. */
  crew: string[];
}

/** A flying drone of a hangar; it has no health of its own. */
export interface DroneSnapshot {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface HazardSnapshot {
  id: string;
  kind: HazardKind;
  x: number;
  y: number;
  r: number;
  /** Seconds left; warnings detonate when this hits zero. */
  life: number;
  maxLife: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  lobbyCode: string;
  hostSessionId: string;
  mapId: string;
  /** Stable id and current permanent payout, also used for a safe voluntary exit. */
  runId: string;
  runGold: number;
  runVictory: boolean;
  /** Endless run: the waves never stop and no map gets cleared. */
  endless: boolean;
  wave: number;
  /** Waves the map has planned, or zero while an endless run is going. */
  totalWaves: number;
  waveLabel: string;
  waveKind: WaveKind;
  enemiesRemaining: number;
  statusText: string;
  /** Campaign-only structure that the squad must defend or escort. */
  objectiveActive?: boolean;
  objectiveKind?: '' | 'holdout' | 'escort' | 'timed';
  objectiveTitle?: string;
  objectiveX?: number;
  objectiveY?: number;
  objectiveRadius?: number;
  objectiveHealth?: number;
  objectiveMaxHealth?: number;
  objectiveProgress?: number;
  /** Countdown for a continuous timed-survival mission. */
  objectiveTimeRemaining?: number;
  objectiveDuration?: number;
  bossName: string;
  bossHealth: number;
  bossMaxHealth: number;
  players: Record<string, PlayerSnapshot>;
  zombies: Record<string, ZombieSnapshot>;
  projectiles: Record<string, ProjectileSnapshot>;
  defenses: Record<string, DefenseSnapshot>;
  vehicles: Record<string, VehicleSnapshot>;
  drones: Record<string, DroneSnapshot>;
  hazards: Record<string, HazardSnapshot>;
  fx?: FxEvent[];
}

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
  reload: boolean;
  dash: boolean;
  aimX: number;
  aimY: number;
}
