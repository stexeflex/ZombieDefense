export type WeaponType =
  | 'pistol'
  | 'crowbar'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'fireaxe'
  | 'nailgun'
  | 'magnum'
  | 'sniper'
  | 'knife'
  | 'acid'
  | 'lmg'
  | 'elephant'
  | 'flamer'
  | 'chainsaw'
  | 'spear'
  | 'cryo'
  | 'rocket'
  | 'firerocket'
  | 'tesla'
  | 'laser'
  | 'throwshield'
  | 'railgun'
  | 'phaselance'
  | 'gravity'
  | 'thunderhammer'
  | 'nova'
  | 'stormorb'
  | 'dashknife'
  | 'ionstorm'
  | 'colossus'
  | 'worldbreaker'
  | 'resonanceblade'
  | 'sun'
  | 'riftcannon';

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
  /** Melee weapons attack instantly in an arc and never consume ammunition. */
  mode?: 'melee';
  /** Width of a melee swing in radians. */
  meleeArc?: number;
  /** Maximum enemies one melee swing can connect with. */
  meleeTargets?: number;
  /** Distance enemies are pushed away by a melee hit. */
  knockback?: number;
  /** Share of enemy armor ignored by a melee hit, from 0 to 1. */
  armorPierce?: number;
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
  /** A moving projectile may discharge lightning without being consumed. */
  lightningPulse?: { every: number; range: number; damage: number; targets: number };
  /** A moving projectile may tear repeated damaging, pulling rifts along its path. */
  riftPulse?: { every: number; radius: number; damage: number; pull: number };
  /** Additional enemies an ammunition-free thrown shield may visibly redirect towards. */
  throwBounces?: number;
  /** Share of the normal hit damage dealt while the thrown shield pierces back to its owner. */
  throwReturnDamageFactor?: number;
  /** Holding fire charges a throw, a damaging invulnerable dash or a radial shockwave. */
  charge?: {
    kind: 'throw' | 'dash' | 'wave';
    minSeconds: number;
    maxSeconds: number;
    moveFactor: number;
    maxMultiplier: number;
    dashDistance?: number;
  };
  /** Visual and collision size of unusually large ammunition. */
  projectileRadius?: number;
  description: string;
}

/** Even a tap produces an attack, but only a quarter of its uncharged base damage. */
export const CHARGED_WEAPON_MIN_DAMAGE_FACTOR = 0.25;

/** Charged attacks grow continuously from a weak tap to their advertised maximum. */
export function chargedWeaponDamageMultiplier(
  charge: NonNullable<WeaponConfig['charge']>,
  progress: number,
) {
  const safeProgress = Math.max(0, Math.min(1, progress));
  return (
    CHARGED_WEAPON_MIN_DAMAGE_FACTOR +
    (charge.maxMultiplier - CHARGED_WEAPON_MIN_DAMAGE_FACTOR) * safeProgress
  );
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
  crowbar: {
    label: 'Brecheisen',
    short: 'BE',
    cost: 300,
    damage: 62,
    fireDelay: 560,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 84,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 1.75,
    meleeTargets: 2,
    knockback: 24,
    description: 'Günstiger Nahkampf: trifft zwei Gegner und stößt sie zurück',
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
  fireaxe: {
    label: 'Feuerwehr-Axt',
    short: 'AX',
    cost: 1200,
    damage: 168,
    fireDelay: 820,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 98,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 1.6,
    meleeTargets: 4,
    knockback: 48,
    armorPierce: 0.2,
    description: 'Schwere Axt: spaltet Gruppen und knackt einen Teil der Panzerung',
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
    damage: 155,
    fireDelay: 460,
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
  knife: {
    label: 'Kampfmesser',
    short: 'KM',
    cost: 15500,
    damage: 780,
    fireDelay: 240,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 67,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 0.72,
    meleeTargets: 4,
    armorPierce: 0.55,
    description:
      'Extrem kurze Reichweite, dafür rasende Präzisionshiebe mit gewaltigem Schaden und Rüstungsbruch',
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
    description: 'Zerplatzt und lässt türkise Säurelachen zurück',
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
  elephant: {
    label: 'Elefantenbüchse',
    short: 'EB',
    cost: 2500,
    damage: 850,
    fireDelay: 1450,
    magazine: 2,
    reserve: 8,
    reload: 2500,
    speed: 1750,
    pellets: 1,
    spread: 0.008,
    pierce: 0,
    range: 1100,
    ammoCost: 260,
    description: 'Nur zehn Schuss, dafür vernichtender Einzelschaden',
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
  chainsaw: {
    label: 'Kettensäge',
    short: 'KS',
    cost: 2800,
    damage: 38,
    fireDelay: 105,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 92,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 1.05,
    meleeTargets: 3,
    knockback: 8,
    armorPierce: 0.12,
    description: 'Dauerbiss auf kurze Distanz, zerlegt drei Ziele zugleich',
  },
  spear: {
    label: 'Sturmspeer',
    short: 'SP',
    cost: 3200,
    damage: 510,
    fireDelay: 690,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 168,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 0.42,
    meleeTargets: 5,
    knockback: 38,
    armorPierce: 0.38,
    description: 'Schmaler, langer Stich mit hohem Schaden durch eine ganze Reihe',
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
    damage: 78,
    fireDelay: 360,
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
    damage: 42,
    fireDelay: 72,
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
  throwshield: {
    label: 'Wurfschild',
    short: 'WS',
    cost: 18000,
    damage: 540,
    fireDelay: 900,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 780,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 950,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 0.25,
    meleeTargets: 1,
    armorPierce: 0.65,
    throwBounces: 8,
    throwReturnDamageFactor: 0.45,
    projectileRadius: 14,
    description:
      'Wirft ein echtes Schild, das acht weitere Ziele sucht und danach schadend zu dir zurückkehrt',
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
  phaselance: {
    label: 'Phasenlanze',
    short: 'PL',
    cost: 6200,
    damage: 330,
    fireDelay: 520,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 148,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 0.95,
    meleeTargets: 8,
    knockback: 64,
    armorPierce: 0.7,
    description: 'Extrem lange Energieklinge, durchdringt Rüstung und ganze Reihen',
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
  thunderhammer: {
    label: 'Blitzhammer',
    short: 'BH',
    cost: 21000,
    damage: 1450,
    fireDelay: 1150,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 520,
    pellets: 1,
    spread: 0,
    pierce: 26,
    range: 1180,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 1.05,
    meleeTargets: 9,
    armorPierce: 0.7,
    projectileRadius: 26,
    lightningPulse: { every: 0.2, range: 340, damage: 300, targets: 4 },
    charge: {
      kind: 'throw',
      minSeconds: 0.22,
      maxSeconds: 1.8,
      moveFactor: 0.34,
      maxMultiplier: 3.1,
    },
    description:
      'Aufladen und werfen: Schaden und Anzahl der Kettenblitze wachsen mit der Ladung bis zur vollen Stärke',
  },
  nova: {
    label: 'Nova-Kanone',
    short: 'NK',
    cost: 7600,
    damage: 92,
    fireDelay: 720,
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
    splashDamage: 108,
    description: 'Fünf explosive Plasmalanzen in einer breiten Salve',
  },
  stormorb: {
    label: 'Kugelblitzwerfer',
    short: 'KB',
    cost: 16500,
    damage: 320,
    fireDelay: 1750,
    magazine: 5,
    reserve: 25,
    reload: 2800,
    speed: 260,
    pellets: 1,
    spread: 0.006,
    pierce: 30,
    range: 1180,
    ammoCost: 1000,
    projectileRadius: 24,
    lightningPulse: { every: 0.22, range: 340, damage: 210, targets: 4 },
    description: 'Langsame Kugelblitze zucken während des Flugs auf Gegner in ihrer Nähe',
  },
  dashknife: {
    label: 'Dashmesser',
    short: 'DM',
    cost: 9600,
    damage: 920,
    fireDelay: 1750,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 110,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 0.62,
    meleeTargets: 10,
    armorPierce: 0.55,
    charge: {
      kind: 'dash',
      minSeconds: 0.25,
      maxSeconds: 1.65,
      moveFactor: 0.3,
      maxMultiplier: 2.2,
      dashDistance: 620,
    },
    description:
      'Aufladen und losbrechen: ein langer unverwundbarer Dash verletzt alles auf seinem Weg',
  },
  ionstorm: {
    label: 'Ionensturm',
    short: 'IS',
    cost: 10800,
    damage: 115,
    fireDelay: 300,
    magazine: 36,
    reserve: 144,
    reload: 2900,
    speed: 1650,
    pellets: 3,
    spread: 0.12,
    pierce: 0,
    range: 1250,
    ammoCost: 720,
    chain: 4,
    chainRange: 245,
    description: 'Drei Ionenblitze springen durch die ganze Horde',
  },
  colossus: {
    label: 'Kolosswerfer',
    short: 'KW',
    cost: 22000,
    damage: 2640,
    fireDelay: 3000,
    magazine: 4,
    reserve: 20,
    reload: 3500,
    speed: 140,
    pellets: 1,
    spread: 0.002,
    pierce: 60,
    range: 1350,
    ammoCost: 1600,
    projectileRadius: 48,
    description:
      'Ein riesiges, extrem langsames Massivgeschoss verursacht bei jeder Berührung enormen Schaden',
  },
  worldbreaker: {
    label: 'Weltenbrecher',
    short: 'WB',
    cost: 13000,
    damage: 980,
    fireDelay: 1300,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 132,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: 2.75,
    meleeTargets: 14,
    knockback: 165,
    armorPierce: 0.5,
    description: 'Gravitationshammer: vernichtender Rundschlag gegen eine ganze Horde',
  },
  resonanceblade: {
    label: 'Resonanzbrecher',
    short: 'RB',
    cost: 24500,
    damage: 2200,
    fireDelay: 3200,
    magazine: 1,
    reserve: 0,
    reload: 0,
    speed: 1,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: 640,
    ammoCost: 0,
    mode: 'melee',
    meleeArc: Math.PI * 2,
    meleeTargets: 95,
    knockback: 145,
    armorPierce: 0.6,
    charge: {
      kind: 'wave',
      minSeconds: 0.4,
      maxSeconds: 2.4,
      moveFactor: 0.24,
      maxMultiplier: 3.2,
    },
    description:
      'Aufladen und den Boden brechen: eine gewaltige Schadenswelle trifft und stößt alles im Umkreis zurück',
  },
  sun: {
    label: 'Sonnenwerfer',
    short: 'SO',
    cost: 15000,
    damage: 200,
    fireDelay: 2200,
    magazine: 3,
    reserve: 12,
    reload: 3400,
    speed: 720,
    pellets: 1,
    spread: 0.004,
    pierce: 0,
    range: 1500,
    ammoCost: 980,
    splashRadius: 290,
    splashDamage: 980,
    burn: 72,
    burnSeconds: 6,
    description: 'Schleudert eine Mini-Sonne mit gewaltigem Brandradius',
  },
  riftcannon: {
    label: 'Risskanone',
    short: 'RK',
    cost: 30000,
    damage: 1485,
    fireDelay: 3600,
    magazine: 2,
    reserve: 10,
    reload: 4300,
    speed: 220,
    pellets: 1,
    spread: 0.001,
    pierce: 40,
    range: 1320,
    ammoCost: 3000,
    projectileRadius: 34,
    riftPulse: { every: 0.55, radius: 205, damage: 572, pull: 58 },
    description:
      'Ein langsamer Risskern durchbohrt die Horde und reißt entlang seiner Flugbahn wiederholt schädliche Raumrisse auf',
  },
};

export const WEAPON_ORDER: WeaponType[] = [
  'pistol',
  'crowbar',
  'smg',
  'rifle',
  'shotgun',
  'fireaxe',
  'nailgun',
  'magnum',
  'sniper',
  'acid',
  'lmg',
  'elephant',
  'flamer',
  'chainsaw',
  'cryo',
  'spear',
  'rocket',
  'firerocket',
  'tesla',
  'laser',
  'railgun',
  'phaselance',
  'gravity',
  'nova',
  'dashknife',
  'ionstorm',
  'worldbreaker',
  'sun',
  'knife',
  'stormorb',
  'throwshield',
  'thunderhammer',
  'colossus',
  'resonanceblade',
  'riftcannon',
];

export function isMeleeWeapon(weapon: WeaponType | undefined) {
  return Boolean(weapon && WEAPONS[weapon]?.mode === 'melee');
}

/**
 * Fern- and Nahkampf each own a damage ladder, so one step is worth twice as
 * much as the single ladder that used to cover both.
 */
export const WEAPON_DAMAGE_PER_LEVEL = 0.04;

/** Damage multiplier of the ladder this weapon belongs to. */
export function weaponDamageMultiplier(
  weapon: WeaponType,
  upgrades: { weaponDamage: number; meleeDamage: number },
) {
  const level = isMeleeWeapon(weapon) ? upgrades.meleeDamage : upgrades.weaponDamage;
  return 1 + Math.max(0, level) * WEAPON_DAMAGE_PER_LEVEL;
}

/**
 * Share the ammunition upgrade takes off every refill. The regular ladder
 * reaches 40 %; both amplifier tiers can extend it to 90 %.
 */
export function ammoCostReduction(level: number) {
  return Math.min(0.9, Math.max(0, level) * 0.01);
}

/** Upper limit for carried spare ammunition, one full resupply. */
export function reserveCapacity(weapon: WeaponType, reserveLevel = 0) {
  if (isMeleeWeapon(weapon)) return 0;
  return Math.round(WEAPONS[weapon].reserve * (1 + reserveLevel * 0.02));
}

export function magazineCapacity(weapon: WeaponType, magazineLevel = 0) {
  if (isMeleeWeapon(weapon)) return 1;
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
  ammoCostLevel = 0,
) {
  if (weapon === 'pistol' || isMeleeWeapon(weapon)) return 0;
  const missing = Math.max(0, reserveCapacity(weapon, reserveLevel) - currentReserve);
  return Math.ceil(roundValue(weapon, missing, moneyScale, ammoCostLevel));
}

/** What the given number of rounds is worth at this player's ammunition price. */
function roundValue(weapon: WeaponType, rounds: number, moneyScale: number, ammoCostLevel: number) {
  const price = WEAPONS[weapon].ammoCost * moneyScale * (1 - ammoCostReduction(ammoCostLevel));
  return (rounds * price) / WEAPONS[weapon].reserve;
}

/**
 * A sold weapon pays back its original list price, minus the value of every
 * missing round in magazine and reserve. Starter discounts therefore remain a
 * real one-time bonus instead of lowering the weapon's later sale value.
 */
export function weaponSellValue(
  weapon: WeaponType,
  currentAmmo: number,
  currentReserve: number,
  magazineLevel = 0,
  reserveLevel = 0,
  moneyScale = 1,
  ammoCostLevel = 0,
) {
  if (weapon === 'pistol') return 0;
  const originalPrice = WEAPONS[weapon].cost;
  if (isMeleeWeapon(weapon)) return Math.max(0, Math.floor(originalPrice));
  const fullLoad = magazineCapacity(weapon, magazineLevel) + reserveCapacity(weapon, reserveLevel);
  const rounds = Math.max(0, currentAmmo) + Math.max(0, currentReserve);
  const missing = Math.max(0, fullLoad - rounds);
  // Missing rounds are deducted at the same price a refill would cost, so a
  // cheap-ammunition run never has to top up first just to sell for more.
  const ammoValue = Math.ceil(roundValue(weapon, missing, moneyScale, ammoCostLevel));
  return Math.max(0, Math.floor(originalPrice) - ammoValue);
}

export function weaponLife(weapon: WeaponConfig) {
  return weapon.range / weapon.speed;
}
