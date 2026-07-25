import type { DefenseType } from './defenses.js';
import type { WeaponType } from './weapons.js';
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
  | 'burn'
  | 'chain'
  | 'muzzle'
  | 'structure'
  | 'wreck'
  | 'boss'
  | 'heal'
  | 'dash';

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
  alive: boolean;
  money: number;
  weapon: WeaponType;
  /** Every weapon the player bought, in purchase order, pistol first. */
  owned: WeaponType[];
  ammo: number;
  reserveAmmo: number;
  grenades: number;
  grenadeCooldown: number;
  /** Dash charges ready right now and the maximum this player can hold. */
  dashCharges: number;
  dashMax: number;
  /** Seconds left of the current dash — above zero means untouchable. */
  dashing: number;
  dashCooldown: number;
  /** Discounted buys the starter perks still have left this run. */
  weaponDiscount: number;
  barricadeDiscount: number;
  turretDiscount: number;
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
  attacking: number;
  charging: number;
  /** Above zero while a boss is winding up a telegraphed attack. */
  casting: number;
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
  /** What selling pays right now — the full price for a fresh build. */
  refund: number;
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
  wave: number;
  totalWaves: number;
  waveLabel: string;
  waveKind: WaveKind;
  enemiesRemaining: number;
  statusText: string;
  bossName: string;
  bossHealth: number;
  bossMaxHealth: number;
  players: Record<string, PlayerSnapshot>;
  zombies: Record<string, ZombieSnapshot>;
  projectiles: Record<string, ProjectileSnapshot>;
  defenses: Record<string, DefenseSnapshot>;
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
