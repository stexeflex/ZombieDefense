export type GamePhase = 'lobby' | 'combat' | 'build' | 'gameover';
export type ZombieType = 'normal' | 'fast' | 'big';
export type WeaponType = 'pistol' | 'rifle' | 'shotgun';
export type DefenseType = 'barricade' | 'turret';

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
  ammo: number;
  reserveAmmo: number;
  grenades: number;
  grenadeCooldown: number;
  ready: boolean;
  kills: number;
  reviveProgress: number;
  reloading: number;
}

export interface ZombieSnapshot {
  id: string;
  type: ZombieType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  rotation: number;
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
}

export interface GameSnapshot {
  phase: GamePhase;
  lobbyCode: string;
  hostSessionId: string;
  wave: number;
  enemiesRemaining: number;
  nextWaveIn: number;
  statusText: string;
  players: Record<string, PlayerSnapshot>;
  zombies: Record<string, ZombieSnapshot>;
  projectiles: Record<string, ProjectileSnapshot>;
  defenses: Record<string, DefenseSnapshot>;
}

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
  reload: boolean;
  interact: boolean;
  aimX: number;
  aimY: number;
}

export interface PermanentUpgrades {
  maxHealth: number;
  moveSpeed: number;
  weaponDamage: number;
  reloadSpeed: number;
  magazineSize: number;
  grenadeDamage: number;
  grenadeCooldown: number;
  grenadeRadius: number;
  barricadeHealth: number;
  turretDamage: number;
}

export const EMPTY_UPGRADES: PermanentUpgrades = {
  maxHealth: 0,
  moveSpeed: 0,
  weaponDamage: 0,
  reloadSpeed: 0,
  magazineSize: 0,
  grenadeDamage: 0,
  grenadeCooldown: 0,
  grenadeRadius: 0,
  barricadeHealth: 0,
  turretDamage: 0,
};

export const ARENA = {
  width: 1280,
  height: 720,
  padding: 42,
} as const;

export const WEAPONS = {
  pistol: {
    label: 'Pistole',
    cost: 0,
    damage: 22,
    fireDelay: 320,
    magazine: 12,
    reserve: 72,
    reload: 1100,
    speed: 820,
    pellets: 1,
    spread: 0.025,
  },
  rifle: {
    label: 'Sturmgewehr',
    cost: 650,
    damage: 15,
    fireDelay: 105,
    magazine: 30,
    reserve: 150,
    reload: 1550,
    speed: 900,
    pellets: 1,
    spread: 0.045,
  },
  shotgun: {
    label: 'Schrotflinte',
    cost: 900,
    damage: 12,
    fireDelay: 690,
    magazine: 8,
    reserve: 56,
    reload: 1900,
    speed: 760,
    pellets: 7,
    spread: 0.24,
  },
} as const;

export const DEFENSES = {
  barricade: { label: 'Barrikade', cost: 250, health: 420 },
  turret: { label: 'MG-Turm', cost: 550, health: 260 },
} as const;

export const WAVES: ReadonlyArray<ReadonlyArray<ZombieType>> = [
  [...Array<ZombieType>(15).fill('normal')],
  [...Array<ZombieType>(22).fill('normal')],
  [...Array<ZombieType>(20).fill('normal'), ...Array<ZombieType>(5).fill('fast')],
  [...Array<ZombieType>(30).fill('normal')],
  ['big', ...Array<ZombieType>(25).fill('normal')],
  [...Array<ZombieType>(20).fill('normal'), ...Array<ZombieType>(12).fill('fast'), 'big'],
  [...Array<ZombieType>(35).fill('normal'), ...Array<ZombieType>(3).fill('big')],
  [...Array<ZombieType>(25).fill('normal'), ...Array<ZombieType>(20).fill('fast'), ...Array<ZombieType>(4).fill('big')],
  [...Array<ZombieType>(45).fill('normal'), ...Array<ZombieType>(8).fill('fast'), ...Array<ZombieType>(5).fill('big')],
  [...Array<ZombieType>(50).fill('normal'), ...Array<ZombieType>(20).fill('fast'), ...Array<ZombieType>(8).fill('big')],
];
