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
  grenadeSplit: number;
  mortarDamage: number;
  mortarCooldown: number;
  mortarRadius: number;
  mortarSlow: number;
  precisionDamage: number;
  precisionCooldown: number;
  precisionWidth: number;
  precisionExecute: number;
  precisionHealthDamage: number;
  nullCoreDamage: number;
  nullCoreCooldown: number;
  nullCoreDuration: number;
  nullCoreRadius: number;
  nullFieldRadius: number;
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
  grenadeSplit: 0,
  mortarDamage: 0,
  mortarCooldown: 0,
  mortarRadius: 0,
  mortarSlow: 0,
  precisionDamage: 0,
  precisionCooldown: 0,
  precisionWidth: 0,
  precisionExecute: 0,
  precisionHealthDamage: 0,
  nullCoreDamage: 0,
  nullCoreCooldown: 0,
  nullCoreDuration: 0,
  nullCoreRadius: 0,
  nullFieldRadius: 0,
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
  armor: 35,
  vehicleArmor: 35,
  grenadeSplit: 10,
  mortarSlow: 8,
  precisionWidth: 8,
  precisionExecute: 10,
  precisionHealthDamage: 10,
  dashCharges: 3,
  dashResist: 6,
};

/** Level ladders shown under the active-ability shop tab. */
export const ABILITY_UPGRADE_KEYS = new Set<UpgradeKey>([
  'grenadeDamage',
  'grenadeCooldown',
  'grenadeRadius',
  'grenadeSplit',
  'mortarDamage',
  'mortarCooldown',
  'mortarRadius',
  'mortarSlow',
  'precisionDamage',
  'precisionCooldown',
  'precisionWidth',
  'precisionExecute',
  'precisionHealthDamage',
  'nullCoreDamage',
  'nullCoreCooldown',
  'nullCoreDuration',
  'nullCoreRadius',
  'nullFieldRadius',
]);

/** Extra room each matching Stufenverstärker opens on an upgrade ladder. */
export const UPGRADE_AMPLIFIER_FACTOR = 1.5;

type UpgradeAmplifierPerks = Pick<
  PermanentPerks,
  'upgradeAmplifier' | 'abilityUpgradeAmplifier' | 'upgradeAmplifier2' | 'abilityUpgradeAmplifier2'
>;

export function upgradeMaxLevel(key: UpgradeKey, perks?: UpgradeAmplifierPerks) {
  const base = UPGRADE_LIMITS[key] ?? UPGRADE_MAX_LEVEL;
  // Dash resistance is already absolute immunity at its regular maximum.
  // Selling more levels with no possible effect would be a trap.
  if (key === 'dashResist') return base;
  const abilityUpgrade = ABILITY_UPGRADE_KEYS.has(key);
  const firstAmplifier = abilityUpgrade ? perks?.abilityUpgradeAmplifier : perks?.upgradeAmplifier;
  const secondAmplifier = abilityUpgrade
    ? perks?.abilityUpgradeAmplifier2
    : perks?.upgradeAmplifier2;
  if (!firstAmplifier) return base;
  const firstMaximum = Math.ceil(base * UPGRADE_AMPLIFIER_FACTOR);
  return secondAmplifier ? Math.ceil(firstMaximum * UPGRADE_AMPLIFIER_FACTOR) : firstMaximum;
}

export function upgradeLevelCost(key: UpgradeKey, level: number) {
  if (key === 'grenadeSplit') return 900 + level * 650;
  if (key === 'precisionHealthDamage') return 850 + level * 550;
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

/** The regular ladder reaches 35 %; both amplifier tiers can extend it to 80 %. */
export function armorReduction(level: number) {
  return Math.min(0.8, level * 0.01);
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
  /** A mortar impact leaves a burning field behind. */
  mortarNapalm: boolean;
  /** One more mortar strike can be held ready. */
  extraMortar: boolean;
  /** A lethal precision shot greatly reduces its running cooldown. */
  precisionReload: boolean;
  /** One more precision shot can be held ready. */
  extraPrecision: boolean;
  /** The null core's outer field slows enemies and pulls them into its centre. */
  nullCoreGravity: boolean;
  /** One more null core can be held ready. */
  extraNullCore: boolean;
  /** Once per wave a lethal hit leaves one hit point instead. */
  lastStand: boolean;
  /** A destroyed vehicle grants its crew one second of invulnerability. */
  emergencyExit: boolean;
  /** Regular upgrade ladders can be bought fifty percent further. */
  upgradeAmplifier: boolean;
  /** Ability upgrade ladders can be bought fifty percent further. */
  abilityUpgradeAmplifier: boolean;
  /** Regular upgrade ladders can be extended by another fifty percent. */
  upgradeAmplifier2: boolean;
  /** Ability upgrade ladders can be extended by another fifty percent. */
  abilityUpgradeAmplifier2: boolean;
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
  mortarNapalm: false,
  extraMortar: false,
  precisionReload: false,
  extraPrecision: false,
  nullCoreGravity: false,
  extraNullCore: false,
  lastStand: false,
  emergencyExit: false,
  upgradeAmplifier: false,
  abilityUpgradeAmplifier: false,
  upgradeAmplifier2: false,
  abilityUpgradeAmplifier2: false,
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
  mortarNapalm: 1800,
  extraMortar: 2600,
  precisionReload: 2200,
  extraPrecision: 3000,
  nullCoreGravity: 3200,
  extraNullCore: 4000,
  lastStand: 2200,
  emergencyExit: 2000,
  upgradeAmplifier: 50000,
  abilityUpgradeAmplifier: 50000,
  upgradeAmplifier2: 100000,
  abilityUpgradeAmplifier2: 100000,
};

/** Follow-up perks become buyable only after their matching first tier. */
export const PERK_REQUIRES: Partial<Record<PerkKey, PerkKey>> = {
  upgradeAmplifier2: 'upgradeAmplifier',
  abilityUpgradeAmplifier2: 'abilityUpgradeAmplifier',
};

export function perkUnlocked(key: PerkKey, perks: PermanentPerks) {
  const required = PERK_REQUIRES[key];
  return !required || perks[required];
}

/** Bought levels always count exactly once; the amplifier only opens more purchases. */
export function effectiveUpgradeLevel(level: number, _perks: PermanentPerks) {
  return Math.max(0, Math.floor(Number(level) || 0));
}

/** Sanitised stat bundle shared by client previews and the server. */
export function effectiveUpgrades(
  upgrades: PermanentUpgrades,
  perks: PermanentPerks,
): PermanentUpgrades {
  return Object.fromEntries(
    (Object.keys(upgrades) as UpgradeKey[]).map((key) => [
      key,
      effectiveUpgradeLevel(upgrades[key], perks),
    ]),
  ) as unknown as PermanentUpgrades;
}

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
export const STARTER_DISCOUNT = 0.2;
/** How many barricades the starter perk covers. */
export const STARTER_BARRICADE_COUNT = 2;
/** How much cheaper repairs get with the engineer perk. */
export const ENGINEER_DISCOUNT = 0.4;

/** Price of the next purchase in a category, given the discounts still left. */
export function discountedCost(cost: number, discountsLeft: number) {
  return discountsLeft > 0 ? Math.round(cost * (1 - STARTER_DISCOUNT)) : cost;
}
