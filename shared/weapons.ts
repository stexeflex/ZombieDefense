export type WeaponType =
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'flamer'
  | 'cryo'
  | 'rocket'
  | 'tesla'
  | 'laser';

export interface WeaponConfig {
  label: string;
  short: string;
  cost: number;
  damage: number;
  /** milliseconds between shots */
  fireDelay: number;
  magazine: number;
  reserve: number;
  /** milliseconds */
  reload: number;
  speed: number;
  pellets: number;
  spread: number;
  pierce: number;
  range: number;
  ammoCost: number;
  splashRadius?: number;
  splashDamage?: number;
  chain?: number;
  chainRange?: number;
  burn?: number;
  burnSeconds?: number;
  /** Share of speed a hit takes away, 0.5 leaves half the pace. */
  slow?: number;
  slowSeconds?: number;
  description: string;
}

export const WEAPONS: Record<WeaponType, WeaponConfig> = {
  pistol: {
    label: 'Pistole',
    short: 'PS',
    cost: 0,
    damage: 24,
    fireDelay: 290,
    magazine: 12,
    reserve: 96,
    reload: 1000,
    speed: 900,
    pellets: 1,
    spread: 0.022,
    pierce: 0,
    range: 720,
    ammoCost: 40,
    description: 'Zuverlässige Startwaffe',
  },
  smg: {
    label: 'Maschinenpistole',
    short: 'MP',
    cost: 450,
    damage: 15,
    fireDelay: 82,
    magazine: 34,
    reserve: 238,
    reload: 1250,
    speed: 860,
    pellets: 1,
    spread: 0.075,
    pierce: 0,
    range: 620,
    ammoCost: 60,
    description: 'Sehr hohe Feuerrate, streut stark',
  },
  rifle: {
    label: 'Sturmgewehr',
    short: 'AR',
    cost: 900,
    damage: 23,
    fireDelay: 105,
    magazine: 30,
    reserve: 210,
    reload: 1500,
    speed: 950,
    pellets: 1,
    spread: 0.035,
    pierce: 1,
    range: 900,
    ammoCost: 95,
    description: 'Allrounder, durchschlägt einen Gegner',
  },
  shotgun: {
    label: 'Schrotflinte',
    short: 'SG',
    cost: 1100,
    damage: 16,
    fireDelay: 620,
    magazine: 8,
    reserve: 64,
    reload: 1900,
    speed: 780,
    pellets: 8,
    spread: 0.26,
    pierce: 1,
    range: 400,
    ammoCost: 110,
    description: 'Brutal auf kurze Distanz',
  },
  sniper: {
    label: 'Scharfschützengewehr',
    short: 'SR',
    cost: 1700,
    damage: 215,
    fireDelay: 1150,
    magazine: 5,
    reserve: 45,
    reload: 2100,
    speed: 1900,
    pellets: 1,
    spread: 0.004,
    pierce: 4,
    range: 1700,
    ammoCost: 130,
    description: 'Durchschlägt ganze Reihen',
  },
  lmg: {
    label: 'Maschinengewehr',
    short: 'MG',
    cost: 2300,
    damage: 27,
    fireDelay: 72,
    magazine: 100,
    reserve: 400,
    reload: 3400,
    speed: 980,
    pellets: 1,
    spread: 0.08,
    pierce: 1,
    range: 950,
    ammoCost: 175,
    description: '100 Schuss Dauerfeuer, langes Nachladen',
  },
  flamer: {
    label: 'Flammenwerfer',
    short: 'FL',
    cost: 2700,
    damage: 13,
    fireDelay: 45,
    magazine: 220,
    reserve: 660,
    reload: 2600,
    speed: 430,
    pellets: 1,
    spread: 0.17,
    pierce: 4,
    range: 270,
    ammoCost: 150,
    burn: 26,
    burnSeconds: 2.6,
    description: 'Kurze Reichweite, setzt Horden in Brand',
  },
  cryo: {
    label: 'Frostkanone',
    short: 'FK',
    cost: 3000,
    damage: 21,
    fireDelay: 120,
    magazine: 60,
    reserve: 300,
    reload: 2400,
    speed: 700,
    pellets: 1,
    spread: 0.06,
    pierce: 2,
    range: 520,
    ammoCost: 190,
    slow: 0.5,
    slowSeconds: 2.4,
    description: 'Friert ganze Reihen auf halbes Tempo ein',
  },
  rocket: {
    label: 'Raketenwerfer',
    short: 'RW',
    cost: 3300,
    damage: 120,
    fireDelay: 1050,
    magazine: 4,
    reserve: 28,
    reload: 2600,
    speed: 640,
    pellets: 1,
    spread: 0.01,
    pierce: 0,
    range: 1400,
    ammoCost: 230,
    splashRadius: 155,
    splashDamage: 210,
    description: 'Räumt Gruppen mit einem Schuss ab',
  },
  tesla: {
    label: 'Blitzstreuer',
    short: 'BS',
    cost: 3900,
    damage: 64,
    fireDelay: 400,
    magazine: 18,
    reserve: 108,
    reload: 2300,
    speed: 1300,
    pellets: 1,
    spread: 0.03,
    pierce: 0,
    range: 900,
    ammoCost: 245,
    chain: 4,
    chainRange: 210,
    description: 'Blitz springt auf vier weitere Gegner über',
  },
  laser: {
    label: 'Laserkanone',
    short: 'LK',
    cost: 4800,
    damage: 46,
    fireDelay: 65,
    magazine: 150,
    reserve: 450,
    reload: 3000,
    speed: 2600,
    pellets: 1,
    spread: 0.006,
    pierce: 6,
    range: 1250,
    ammoCost: 310,
    description: 'Durchgehender Strahl, schmilzt alles',
  },
};

export const WEAPON_ORDER: WeaponType[] = [
  'pistol',
  'smg',
  'rifle',
  'shotgun',
  'sniper',
  'lmg',
  'flamer',
  'cryo',
  'rocket',
  'tesla',
  'laser',
];

/** Upper limit for carried spare ammunition, one full resupply. */
export function reserveCapacity(weapon: WeaponType, reserveLevel = 0) {
  return Math.round(WEAPONS[weapon].reserve * (1 + reserveLevel * 0.02));
}

/**
 * Price only the rounds that are actually missing. `ammoCost` is the price of
 * the weapon's base reserve, so upgrades that add more space keep the same
 * fair price per round.
 */
export function ammoRefillCost(
  weapon: WeaponType,
  currentReserve: number,
  reserveLevel = 0,
  moneyScale = 1,
) {
  if (weapon === 'pistol') return 0;
  const missing = Math.max(0, reserveCapacity(weapon, reserveLevel) - currentReserve);
  return Math.ceil((missing * WEAPONS[weapon].ammoCost * moneyScale) / WEAPONS[weapon].reserve);
}

export function weaponLife(weapon: WeaponConfig) {
  return weapon.range / weapon.speed;
}
