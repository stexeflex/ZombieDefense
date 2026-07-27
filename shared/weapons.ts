export type WeaponType =
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'nailgun'
  | 'magnum'
  | 'sniper'
  | 'acid'
  | 'lmg'
  | 'flamer'
  | 'cryo'
  | 'rocket'
  | 'firerocket'
  | 'tesla'
  | 'laser'
  | 'railgun'
  | 'gravity'
  | 'nova';

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
  /** Radius of the acid puddle an impact leaves on the ground. */
  acidRadius?: number;
  /** Damage per second that puddle deals to everything standing in it. */
  acidDps?: number;
  acidSeconds?: number;
  /** Share of speed a hit takes away, 0.5 leaves half the pace. */
  slow?: number;
  slowSeconds?: number;
  /** Immediate pull towards a splash impact, measured in world units. */
  pull?: number;
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
  nailgun: {
    label: 'Nagelwerfer',
    short: 'NW',
    cost: 1400,
    damage: 42,
    fireDelay: 180,
    magazine: 24,
    reserve: 168,
    reload: 1600,
    speed: 1050,
    pellets: 1,
    spread: 0.025,
    pierce: 3,
    range: 820,
    ammoCost: 115,
    description: 'Schwere Nägel durchbohren mehrere Gegner',
  },
  magnum: {
    label: 'Schwere Magnum',
    short: 'MA',
    cost: 1550,
    damage: 112,
    fireDelay: 500,
    magazine: 6,
    reserve: 54,
    reload: 1500,
    speed: 1250,
    pellets: 1,
    spread: 0.014,
    pierce: 0,
    range: 780,
    ammoCost: 125,
    description: 'Schlägt hart zu, bleibt aber im ersten Gegner stecken',
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
  acid: {
    label: 'Säurewerfer',
    short: 'SW',
    cost: 2000,
    damage: 46,
    fireDelay: 420,
    magazine: 12,
    reserve: 72,
    reload: 1900,
    speed: 600,
    pellets: 1,
    spread: 0.035,
    pierce: 0,
    range: 650,
    ammoCost: 155,
    splashRadius: 80,
    splashDamage: 55,
    acidRadius: 96,
    acidDps: 30,
    acidSeconds: 4.5,
    description: 'Zerplatzt und lässt grüne Säurelachen zurück',
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
  firerocket: {
    label: 'Feuer-Raketenwerfer',
    short: 'FR',
    cost: 3600,
    damage: 85,
    fireDelay: 900,
    magazine: 5,
    reserve: 35,
    reload: 2500,
    speed: 620,
    pellets: 1,
    spread: 0.012,
    pierce: 0,
    range: 1250,
    ammoCost: 250,
    splashRadius: 140,
    splashDamage: 150,
    burn: 34,
    burnSeconds: 4,
    description: 'Brandrakete zerplatzt in einer Feuerwolke, die weiterfrisst',
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
  railgun: {
    label: 'Railgun',
    short: 'RG',
    cost: 5700,
    damage: 520,
    fireDelay: 1500,
    magazine: 4,
    reserve: 28,
    reload: 2600,
    speed: 3400,
    pellets: 1,
    spread: 0.001,
    pierce: 14,
    range: 1900,
    ammoCost: 380,
    description: 'Magnetgeschoss durchbohrt eine komplette Horde',
  },
  gravity: {
    label: 'Gravitationswerfer',
    short: 'GW',
    cost: 6600,
    damage: 75,
    fireDelay: 900,
    magazine: 6,
    reserve: 36,
    reload: 2800,
    speed: 540,
    pellets: 1,
    spread: 0.008,
    pierce: 0,
    range: 1250,
    ammoCost: 430,
    splashRadius: 230,
    splashDamage: 360,
    slow: 0.42,
    slowSeconds: 2.8,
    pull: 155,
    description: 'Singularität zieht Horden zusammen und bremst sie',
  },
  nova: {
    label: 'Nova-Kanone',
    short: 'NK',
    cost: 7600,
    damage: 92,
    fireDelay: 680,
    magazine: 12,
    reserve: 72,
    reload: 3000,
    speed: 1500,
    pellets: 5,
    spread: 0.13,
    pierce: 2,
    range: 1050,
    ammoCost: 510,
    splashRadius: 82,
    splashDamage: 125,
    description: 'Fünf explosive Plasmalanzen in einer breiten Salve',
  },
};

export const WEAPON_ORDER: WeaponType[] = [
  'pistol',
  'smg',
  'rifle',
  'shotgun',
  'nailgun',
  'magnum',
  'sniper',
  'acid',
  'lmg',
  'flamer',
  'cryo',
  'rocket',
  'firerocket',
  'tesla',
  'laser',
  'railgun',
  'gravity',
  'nova',
];

/** Upper limit for carried spare ammunition, one full resupply. */
export function reserveCapacity(weapon: WeaponType, reserveLevel = 0) {
  return Math.round(WEAPONS[weapon].reserve * (1 + reserveLevel * 0.02));
}

export function magazineCapacity(weapon: WeaponType, magazineLevel = 0) {
  return Math.max(1, Math.round(WEAPONS[weapon].magazine * (1 + magazineLevel * 0.02)));
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

/**
 * A sold weapon pays back what this player actually spent, minus the value of
 * every missing round in magazine and reserve. Buying it again can therefore
 * never be a cheaper ammunition refill, even after a starter discount.
 */
export function weaponSellValue(
  weapon: WeaponType,
  purchasePrice: number,
  currentAmmo: number,
  currentReserve: number,
  magazineLevel = 0,
  reserveLevel = 0,
  moneyScale = 1,
) {
  if (weapon === 'pistol') return 0;
  const fullLoad = magazineCapacity(weapon, magazineLevel) + reserveCapacity(weapon, reserveLevel);
  const rounds = Math.max(0, currentAmmo) + Math.max(0, currentReserve);
  const missing = Math.max(0, fullLoad - rounds);
  const ammoValue = Math.ceil(
    (missing * WEAPONS[weapon].ammoCost * moneyScale) / WEAPONS[weapon].reserve,
  );
  return Math.max(0, Math.floor(purchasePrice) - ammoValue);
}

export function weaponLife(weapon: WeaponConfig) {
  return weapon.range / weapon.speed;
}
