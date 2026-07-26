import type Phaser from 'phaser';
import type { DefenseType, HazardKind, WeaponType, ZombieType } from '../../../shared/game-types';

export type ViewRoot = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  destroy(fromScene?: boolean): void;
};

export interface BaseView {
  root: ViewRoot;
  targetX: number;
  targetY: number;
}

export interface PlayerView extends BaseView {
  root: Phaser.GameObjects.Container;
  actor: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  legs: Phaser.GameObjects.Image[];
  label: Phaser.GameObjects.Text;
  healthBar: Phaser.GameObjects.Rectangle;
  /** Thin blue bar under the health, only up while a shield is charged. */
  shieldBar: Phaser.GameObjects.Rectangle;
  reviveBackground: Phaser.GameObjects.Rectangle;
  reviveBar: Phaser.GameObjects.Rectangle;
  reviveText: Phaser.GameObjects.Text;
  /** Ring that shows the player is untouchable while dashing. */
  dashRing: Phaser.GameObjects.Arc;
  dashPulse: number;
  walk: number;
  weaponKey: WeaponType;
  colorIndex: number;
}

export interface ZombieView extends BaseView {
  root: Phaser.GameObjects.Container;
  actor: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  limbs: Phaser.GameObjects.Image[];
  healthBar: Phaser.GameObjects.Rectangle;
  healthBackground: Phaser.GameObjects.Rectangle;
  aura?: Phaser.GameObjects.Arc;
  walk: number;
  type: ZombieType;
  radius: number;
  lastHealth: number;
  flameTimer: number;
}

export interface DefenseView extends BaseView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  gun?: Phaser.GameObjects.Image;
  healthBar: Phaser.GameObjects.Rectangle;
  type: DefenseType;
}

export interface ProjectileView extends BaseView {
  root: Phaser.GameObjects.Image;
  kind: string;
  smoke: number;
}

export interface HazardView extends BaseView {
  root: Phaser.GameObjects.Container;
  pool: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
  fill: Phaser.GameObjects.Arc;
  kind: HazardKind;
  radius: number;
  pulse: number;
}

export interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  seed: number;
}

export const PROJECTILE_STYLE: Record<
  string,
  { texture: string; tint: number; scaleX: number; scaleY: number }
> = {
  pistol: { texture: 'fx-spark', tint: 0xfff0b8, scaleX: 1.5, scaleY: 0.42 },
  smg: { texture: 'fx-spark', tint: 0xffe89a, scaleX: 1.3, scaleY: 0.4 },
  rifle: { texture: 'fx-spark', tint: 0xfff3c4, scaleX: 1.9, scaleY: 0.4 },
  shotgun: { texture: 'fx-spark', tint: 0xffd591, scaleX: 1.1, scaleY: 0.38 },
  sniper: { texture: 'fx-spark', tint: 0xd8fbff, scaleX: 3.4, scaleY: 0.42 },
  lmg: { texture: 'fx-spark', tint: 0xfff0b8, scaleX: 2.1, scaleY: 0.45 },
  flamer: { texture: 'fx-flame', tint: 0xffa04a, scaleX: 1.5, scaleY: 1.5 },
  cryo: { texture: 'fx-energy', tint: 0xaef0ff, scaleX: 1.3, scaleY: 1.1 },
  rocket: { texture: 'fx-glow', tint: 0xffb066, scaleX: 0.55, scaleY: 0.4 },
  tesla: { texture: 'fx-energy', tint: 0x9fdcff, scaleX: 1.4, scaleY: 1.1 },
  laser: { texture: 'fx-spark', tint: 0xff8fd8, scaleX: 4.2, scaleY: 0.6 },
  turret_mg: { texture: 'fx-spark', tint: 0x9fe8ff, scaleX: 1.7, scaleY: 0.42 },
  turret_flame: { texture: 'fx-flame', tint: 0xff8f4a, scaleX: 1.6, scaleY: 1.6 },
  turret_marksman: { texture: 'fx-spark', tint: 0xc9ffe0, scaleX: 3, scaleY: 0.45 },
  turret_tesla: { texture: 'fx-energy', tint: 0x9fdcff, scaleX: 1.5, scaleY: 1.2 },
  turret_launcher: { texture: 'fx-glow', tint: 0xffb066, scaleX: 0.5, scaleY: 0.4 },
  turret_laser: { texture: 'fx-spark', tint: 0xff8fd8, scaleX: 3.8, scaleY: 0.55 },
};

/** Pool colours; warnings are drawn in red no matter what fires them. */
export const HAZARD_STYLE: Record<HazardKind, { tint: number; alpha: number }> = {
  warning: { tint: 0xff4f6b, alpha: 0.3 },
  lava: { tint: 0xff7a2a, alpha: 0.55 },
  poison: { tint: 0x8dff6b, alpha: 0.45 },
  pull: { tint: 0x4ce0d5, alpha: 0.22 },
};
