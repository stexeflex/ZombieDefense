/**
 * Permanent progress: levelled upgrades that get bought over and over, and
 * one-time perks that change a rule instead of a number.
 */

export interface PermanentUpgrades {
  maxHealth: number;
  moveSpeed: number;
  weaponDamage: number;
  reloadSpeed: number;
  magazineSize: number;
  reserveAmmo: number;
  grenadeDamage: number;
  grenadeCooldown: number;
  grenadeRadius: number;
  barricadeHealth: number;
  turretDamage: number;
  turretRange: number;
  armor: number;
  dashCharges: number;
  dashRecharge: number;
  reviveSpeed: number;
}

export type UpgradeKey = keyof PermanentUpgrades;

export const EMPTY_UPGRADES: PermanentUpgrades = {
  maxHealth: 0,
  moveSpeed: 0,
  weaponDamage: 0,
  reloadSpeed: 0,
  magazineSize: 0,
  reserveAmmo: 0,
  grenadeDamage: 0,
  grenadeCooldown: 0,
  grenadeRadius: 0,
  barricadeHealth: 0,
  turretDamage: 0,
  turretRange: 0,
  armor: 0,
  dashCharges: 0,
  dashRecharge: 0,
  reviveSpeed: 0,
};

/** Room to specialise: a focused player can push a single stat very far. */
export const UPGRADE_MAX_LEVEL = 40;

/** Gold for the next level of a percent upgrade. */
export function upgradeCost(level: number) {
  return 40 + level * 16;
}

/**
 * A few upgrades hand out whole extra charges instead of percent, so they get
 * their own short ladder with a much steeper price.
 */
export const UPGRADE_LIMITS: Partial<Record<UpgradeKey, number>> = {
  dashCharges: 3,
};

export function upgradeMaxLevel(key: UpgradeKey) {
  return UPGRADE_LIMITS[key] ?? UPGRADE_MAX_LEVEL;
}

export function upgradeLevelCost(key: UpgradeKey, level: number) {
  return key === 'dashCharges' ? 700 + level * 900 : upgradeCost(level);
}

/** Damage reduction from armour, capped so no build becomes untouchable. */
export function armorReduction(level: number) {
  return Math.min(0.35, level * 0.01);
}

// ------------------------------------------------------------------- perks

export interface PermanentPerks {
  /** The first weapon of a run costs a lot less. */
  starterWeapon: boolean;
  /** The first few barricades of a run cost a lot less. */
  starterBarricade: boolean;
  /** The first turret of a run costs a lot less. */
  starterTurret: boolean;
  /** The dash knocks zombies aside and hurts them. */
  dashShock: boolean;
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
  dashShock: false,
  fieldMedic: false,
  engineer: false,
  extraGrenade: false,
  lastStand: false,
};

export const PERK_COST: Record<PerkKey, number> = {
  starterWeapon: 900,
  starterBarricade: 750,
  starterTurret: 1100,
  dashShock: 1400,
  fieldMedic: 800,
  engineer: 700,
  extraGrenade: 1000,
  lastStand: 2200,
};

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
