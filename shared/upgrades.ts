/**
 * Permanent progress: levelled upgrades that get bought over and over, and
 * special perks that change a rule instead of a number.
 */

import { DASH_BASE_RESIST, DASH_RESIST_STEP, START_MONEY } from './arena.js';

export interface PermanentUpgrades {
  startMoney: number;
  maxHealth: number;
  healthRegen: number;
  moveSpeed: number;
  weaponDamage: number;
  reloadSpeed: number;
  magazineSize: number;
  reserveAmmo: number;
  meleeSpeed: number;
  meleeRange: number;
  grenadeDamage: number;
  grenadeCooldown: number;
  grenadeRadius: number;
  barricadeHealth: number;
  turretDamage: number;
  turretRange: number;
  vehicleHealth: number;
  vehicleArmor: number;
  vehicleSpeed: number;
  vehicleRam: number;
  vehicleGun: number;
  armor: number;
  dashCharges: number;
  dashRecharge: number;
  dashDamage: number;
  dashShield: number;
  dashResist: number;
}

export type UpgradeKey = keyof PermanentUpgrades;

export const EMPTY_UPGRADES: PermanentUpgrades = {
  startMoney: 0,
  maxHealth: 0,
  healthRegen: 0,
  moveSpeed: 0,
  weaponDamage: 0,
  reloadSpeed: 0,
  magazineSize: 0,
  reserveAmmo: 0,
  meleeSpeed: 0,
  meleeRange: 0,
  grenadeDamage: 0,
  grenadeCooldown: 0,
  grenadeRadius: 0,
  barricadeHealth: 0,
  turretDamage: 0,
  turretRange: 0,
  vehicleHealth: 0,
  vehicleArmor: 0,
  vehicleSpeed: 0,
  vehicleRam: 0,
  vehicleGun: 0,
  armor: 0,
  dashCharges: 0,
  dashRecharge: 0,
  dashDamage: 0,
  dashShield: 0,
  dashResist: 0,
};

/** Room to specialise: a focused player can push a single stat very far. */
export const UPGRADE_MAX_LEVEL = 40;

/** Gold for the next level of a percent upgrade. */
export function upgradeCost(level: number) {
  return 40 + level * 12;
}

/**
 * A few upgrades move in big steps instead of percent, so they get their own
 * short ladder with a much steeper price: whole dash charges, and the dash
 * resistance that ends in full immunity after six levels.
 */
export const UPGRADE_LIMITS: Partial<Record<UpgradeKey, number>> = {
  dashCharges: 3,
  dashResist: 6,
};

export function upgradeMaxLevel(key: UpgradeKey) {
  return UPGRADE_LIMITS[key] ?? UPGRADE_MAX_LEVEL;
}

export function upgradeLevelCost(key: UpgradeKey, level: number) {
  if (key === 'dashCharges') return 700 + level * 750;
  if (key === 'dashResist') return 500 + level * 450;
  return upgradeCost(level);
}

/** Every level provides this much extra build money at the start of a run. */
export const START_MONEY_PER_LEVEL = 50;
/** Passive health restored per second by one regeneration level. */
export const HEALTH_REGEN_PER_LEVEL = 0.25;

export function startingMoney(level: number) {
  return START_MONEY + Math.max(0, Math.floor(level)) * START_MONEY_PER_LEVEL;
}

export function healthRegenPerSecond(level: number) {
  return Math.max(0, Math.floor(level)) * HEALTH_REGEN_PER_LEVEL;
}

/** Damage reduction from armour, capped so no build becomes untouchable. */
export function armorReduction(level: number) {
  return Math.min(0.35, level * 0.01);
}

/**
 * Share of a hit a dash swallows. The dodge always eats a good part of it, the
 * levelled upgrade buys back the full immunity the dash used to have for free.
 */
export function dashReduction(level: number) {
  return Math.min(1, DASH_BASE_RESIST + level * DASH_RESIST_STEP);
}

// ------------------------------------------------------------------- perks

export interface PermanentPerks {
  /** The first weapon of a run costs a lot less. */
  starterWeapon: boolean;
  /** The first few barricades of a run cost a lot less. */
  starterBarricade: boolean;
  /** The first turret of a run costs a lot less. */
  starterTurret: boolean;
  /** The first vehicle of a run costs a lot less. */
  motorPool: boolean;
  /** The dash knocks zombies aside and hurts them. */
  dashShock: boolean;
  /** Dashing through an enemy cuts it open and charges a shield. */
  dashBlades: boolean;
  /** Reviving is twice as fast and gets the squad mate up with more health. */
  fieldMedic: boolean;
  /** Repairs cost far less. */
  engineer: boolean;
  /** One more grenade in the belt. */
  extraGrenade: boolean;
  /** Once per wave a lethal hit leaves one hit point instead. */
  lastStand: boolean;
}

export type PerkKey = keyof PermanentPerks;

export const EMPTY_PERKS: PermanentPerks = {
  starterWeapon: false,
  starterBarricade: false,
  starterTurret: false,
  motorPool: false,
  dashShock: false,
  dashBlades: false,
  fieldMedic: false,
  engineer: false,
  extraGrenade: false,
  lastStand: false,
};

export const PERK_COST: Record<PerkKey, number> = {
  starterWeapon: 900,
  starterBarricade: 750,
  starterTurret: 1100,
  motorPool: 1500,
  dashShock: 1400,
  dashBlades: 1300,
  fieldMedic: 800,
  engineer: 700,
  extraGrenade: 1000,
  lastStand: 2200,
};

/**
 * Levelled upgrades that scale a rule a perk brings in. Without that perk the
 * level would do nothing at all, so the shop keeps them locked instead of
 * taking gold for it.
 */
export const UPGRADE_REQUIRES: Partial<Record<UpgradeKey, PerkKey[]>> = {
  dashDamage: ['dashShock', 'dashBlades'],
  dashShield: ['dashBlades'],
};

/** One of the listed perks is enough — any of them makes the level count. */
export function upgradeUnlocked(key: UpgradeKey, perks: PermanentPerks) {
  const needed = UPGRADE_REQUIRES[key];
  return !needed || needed.some((perk) => perks[perk]);
}

/** Discount the starter perks give on the first purchase of their category. */
export const STARTER_DISCOUNT = 0.4;
/** How many barricades the starter perk covers. */
export const STARTER_BARRICADE_COUNT = 4;
/** How much cheaper repairs get with the engineer perk. */
export const ENGINEER_DISCOUNT = 0.4;

/** Price of the next purchase in a category, given the discounts still left. */
export function discountedCost(cost: number, discountsLeft: number) {
  return discountsLeft > 0 ? Math.round(cost * (1 - STARTER_DISCOUNT)) : cost;
}
