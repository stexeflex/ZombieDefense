import { ARENA } from './arena.js';
import type { MapObstacle } from './maps.js';

export type DefenseType =
  | 'wood'
  | 'wire'
  | 'stone'
  | 'spike'
  | 'blastwall'
  | 'steel'
  | 'shockwall'
  | 'cryowall'
  | 'titanwall'
  | 'mg'
  | 'flame'
  | 'frost'
  | 'scatter'
  | 'marksman'
  | 'shotgun'
  | 'acid'
  | 'tesla'
  | 'mortar'
  | 'launcher'
  | 'triple'
  | 'laser'
  | 'drone'
  | 'precision_mortar'
  | 'plasma'
  | 'ring';

export interface DefenseConfig {
  label: string;
  short: string;
  kind: 'barricade' | 'turret';
  cost: number;
  health: number;
  width: number;
  height: number;
  /** Ground defenses can be crossed instead of blocking movement. */
  passable?: boolean;
  /** Damage per second dealt while a zombie crosses this defense. */
  contactDamage?: number;
  /** Health lost per second for every zombie currently crossing it. */
  contactWear?: number;
  /** damage dealt back to attacking zombies */
  thorns?: number;
  /** Share of speed removed while crossing or after attacking it. */
  slow?: number;
  slowSeconds?: number;
  /** explodes when enemies destroy it */
  blastRadius?: number;
  blastDamage?: number;
  damage?: number;
  fireDelay?: number;
  range?: number;
  speed?: number;
  pierce?: number;
  splashRadius?: number;
  splashDamage?: number;
  chain?: number;
  chainRange?: number;
  burn?: number;
  burnSeconds?: number;
  /** Acid puddle an impact leaves behind; only zombies stand in it. */
  acidRadius?: number;
  acidDps?: number;
  acidSeconds?: number;
  pellets?: number;
  spread?: number;
  /** How many different zombies this turret attacks per volley. */
  targets?: number;
  /** Delayed arcing shell; the value is its warning and flight time in seconds. */
  mortarImpactSeconds?: number;
  /** Prefer the slow enemy with the largest health pool instead of the nearest one. */
  targetTanky?: boolean;
  /** Share of armor ignored by a mortar impact. */
  armorPierce?: number;
  /** Equally spaced shots fired around the complete circle in one volley. */
  radialShots?: number;
  /** Flying drones this building keeps in the air; it has no gun of its own. */
  drones?: number;
  /** How fast a drone flies and how far it shoots from where it hovers. */
  droneSpeed?: number;
  droneRange?: number;
  description: string;
}

export const DEFENSES: Record<DefenseType, DefenseConfig> = {
  wood: {
    label: 'Holzbarrikade',
    short: '▤',
    kind: 'barricade',
    cost: 160,
    health: 420,
    width: 58,
    height: 26,
    description: 'Billig und schnell ersetzt',
  },
  wire: {
    label: 'Stacheldraht',
    short: '≋',
    kind: 'barricade',
    cost: 230,
    health: 280,
    width: 64,
    height: 20,
    passable: true,
    contactDamage: 36,
    contactWear: 40,
    slow: 0.55,
    description:
      'Durchquerbare Falle: bremst und verletzt, wird von einer Horde schnell zertrampelt',
  },
  spike: {
    label: 'Stachelwall',
    short: '⩕',
    kind: 'barricade',
    cost: 280,
    health: 520,
    width: 58,
    height: 24,
    thorns: 30,
    description: 'Verletzt jeden Zombie, der zuschlägt',
  },
  stone: {
    label: 'Steinmauer',
    short: '▩',
    kind: 'barricade',
    cost: 380,
    health: 1050,
    width: 60,
    height: 30,
    slow: 0.25,
    description: 'Massiv, bremst Angreifer',
  },
  blastwall: {
    label: 'Sprengwand',
    short: '✹',
    kind: 'barricade',
    cost: 540,
    health: 1450,
    width: 64,
    height: 32,
    blastRadius: 150,
    blastDamage: 240,
    description: 'Detoniert beim Zerbrechen mitten in der Horde',
  },
  steel: {
    label: 'Stahlbarrikade',
    short: '▦',
    kind: 'barricade',
    cost: 720,
    health: 2100,
    width: 62,
    height: 28,
    thorns: 10,
    description: 'Hält auch Kolossen lange stand',
  },
  shockwall: {
    label: 'Schockgitter',
    short: 'ϟ',
    kind: 'barricade',
    cost: 1100,
    health: 3100,
    width: 66,
    height: 30,
    thorns: 92,
    slow: 0.32,
    slowSeconds: 1.5,
    description: 'Mittel-teuer: elektrisiert Angreifer und bremst ihren nächsten Anlauf',
  },
  cryowall: {
    label: 'Kryo-Bollwerk',
    short: '❆',
    kind: 'barricade',
    cost: 1900,
    health: 5400,
    width: 68,
    height: 34,
    thorns: 38,
    slow: 0.62,
    slowSeconds: 3,
    description: 'Teuer: massive Kühlwand, die Angreifer lange auf Kriechtempo zwingt',
  },
  titanwall: {
    label: 'Titan-Reaktorwall',
    short: '⬢',
    kind: 'barricade',
    cost: 3400,
    health: 9800,
    width: 72,
    height: 38,
    thorns: 58,
    slow: 0.28,
    slowSeconds: 1.8,
    blastRadius: 220,
    blastDamage: 720,
    description: 'Sehr teuer: Titanfestung mit explosivem Reaktorkern als letzter Vergeltung',
  },
  mg: {
    label: 'MG-Turm',
    short: '⌖',
    kind: 'turret',
    cost: 700,
    health: 340,
    width: 46,
    height: 46,
    damage: 14,
    fireDelay: 0.17,
    range: 400,
    speed: 900,
    pierce: 0,
    description: 'Dauerfeuer auf mittlere Distanz',
  },
  flame: {
    label: 'Brandturm',
    short: '🜂',
    kind: 'turret',
    cost: 1000,
    health: 380,
    width: 46,
    height: 46,
    damage: 8,
    fireDelay: 0.11,
    range: 250,
    speed: 420,
    pierce: 4,
    burn: 22,
    burnSeconds: 2.4,
    description: 'Kurze Reichweite, setzt ganze Gruppen in Brand',
  },
  frost: {
    label: 'Frostturm',
    short: '❄',
    kind: 'turret',
    cost: 1200,
    health: 350,
    width: 46,
    height: 46,
    damage: 22,
    fireDelay: 0.42,
    range: 460,
    speed: 680,
    pierce: 2,
    slow: 0.42,
    slowSeconds: 2,
    description: 'Friert Reihen ein und nimmt ihnen einen Teil ihres Tempos',
  },
  scatter: {
    label: 'Schrottschleuder',
    short: '✣',
    kind: 'turret',
    cost: 1350,
    health: 390,
    width: 48,
    height: 48,
    damage: 21,
    fireDelay: 0.9,
    range: 360,
    speed: 720,
    pierce: 0,
    pellets: 6,
    spread: 0.24,
    description: 'Feuert eine breite Schrottsalve auf kurze Distanz',
  },
  marksman: {
    label: 'Scharfschützenturm',
    short: '⌾',
    kind: 'turret',
    cost: 1500,
    health: 280,
    width: 46,
    height: 46,
    damage: 130,
    fireDelay: 1.3,
    range: 950,
    speed: 1800,
    pierce: 3,
    description: 'Weite Reichweite, durchschlägt Reihen',
  },
  shotgun: {
    label: 'Schrotflinten-Turm',
    short: '✺',
    kind: 'turret',
    cost: 1650,
    health: 430,
    width: 50,
    height: 50,
    damage: 25,
    fireDelay: 0.95,
    range: 380,
    speed: 840,
    pierce: 0,
    pellets: 8,
    spread: 0.3,
    description: 'Acht schwere Schrotkugeln zerreißen Gegner aus nächster Nähe',
  },
  acid: {
    label: 'Säureturm',
    short: '☣',
    kind: 'turret',
    cost: 1750,
    health: 350,
    width: 48,
    height: 48,
    damage: 22,
    fireDelay: 0.95,
    range: 500,
    speed: 580,
    pierce: 0,
    splashRadius: 84,
    splashDamage: 40,
    acidRadius: 92,
    acidDps: 14,
    acidSeconds: 3.5,
    description: 'Ätzt türkise Lachen in den Boden, die weiter fressen',
  },
  tesla: {
    label: 'Blitzturm',
    short: '⚡',
    kind: 'turret',
    cost: 1900,
    health: 320,
    width: 48,
    height: 48,
    damage: 50,
    fireDelay: 0.8,
    range: 520,
    speed: 1300,
    pierce: 0,
    chain: 3,
    chainRange: 190,
    description: 'Blitz springt auf drei Nachbarn über',
  },
  mortar: {
    label: 'Feldmörser',
    short: 'MÖ',
    kind: 'turret',
    cost: 1450,
    health: 330,
    width: 48,
    height: 48,
    damage: 175,
    fireDelay: 1.65,
    range: 720,
    splashRadius: 118,
    mortarImpactSeconds: 0.85,
    description: 'Günstiger Mörser: schnelle, mittelstarke Einschläge mit kurzer Warnung',
  },
  launcher: {
    label: 'Raketenturm',
    short: '⍟',
    kind: 'turret',
    cost: 2200,
    health: 320,
    width: 50,
    height: 50,
    damage: 70,
    fireDelay: 2,
    range: 680,
    speed: 620,
    pierce: 0,
    splashRadius: 150,
    splashDamage: 125,
    description: 'Sprengraketen gegen ganze Gruppen',
  },
  triple: {
    label: 'Dreifachschuss-Turm',
    short: '⋮',
    kind: 'turret',
    cost: 2750,
    health: 460,
    width: 52,
    height: 52,
    damage: 52,
    fireDelay: 0.6,
    range: 730,
    speed: 1150,
    pierce: 2,
    targets: 3,
    description: 'Drei Läufe nehmen gleichzeitig drei verschiedene Ziele unter Feuer',
  },
  laser: {
    label: 'Laserturm',
    short: '≡',
    kind: 'turret',
    cost: 3200,
    health: 360,
    width: 52,
    height: 52,
    damage: 30,
    fireDelay: 0.18,
    range: 900,
    speed: 2500,
    pierce: 5,
    description: 'Endgame: durchschlägt ganze Reihen auf weite Distanz',
  },
  drone: {
    label: 'Drohnenhangar',
    short: '⬡',
    kind: 'turret',
    cost: 3600,
    health: 480,
    width: 54,
    height: 54,
    damage: 52,
    fireDelay: 0.58,
    range: 640,
    speed: 1000,
    pierce: 0,
    drones: 3,
    droneSpeed: 300,
    droneRange: 320,
    description: 'Startet drei Drohnen, die selbst losfliegen und Gegner jagen',
  },
  precision_mortar: {
    label: 'Präzisionsmörser',
    short: 'PM',
    kind: 'turret',
    cost: 5200,
    health: 560,
    width: 56,
    height: 56,
    damage: 1050,
    fireDelay: 5.2,
    range: 1180,
    splashRadius: 190,
    mortarImpactSeconds: 1.75,
    targetTanky: true,
    armorPierce: 0.65,
    description: 'Teuer: jagt langsame Tanks und schlägt nach langer Warnzeit vernichtend ein',
  },
  plasma: {
    label: 'Plasma-Bastion',
    short: '◉',
    kind: 'turret',
    cost: 6800,
    health: 700,
    width: 58,
    height: 58,
    damage: 86,
    fireDelay: 0.19,
    range: 1120,
    speed: 3200,
    pierce: 9,
    description: 'Luxus-Endgame: vernichtet mit Plasma ganze Reihen auf maximale Distanz',
  },
  ring: {
    label: 'Donnerkranz',
    short: '☼',
    kind: 'turret',
    cost: 9800,
    health: 900,
    width: 62,
    height: 62,
    damage: 240,
    fireDelay: 4.8,
    range: 720,
    speed: 1050,
    pierce: 2,
    radialShots: 24,
    description: 'Sehr langsam: feuert 24 schwere Geschosse im kompletten Kreis',
  },
};

export const BARRICADE_ORDER: DefenseType[] = [
  'wood',
  'wire',
  'spike',
  'stone',
  'blastwall',
  'steel',
  'shockwall',
  'cryowall',
  'titanwall',
];
export const TURRET_ORDER: DefenseType[] = [
  'mg',
  'flame',
  'frost',
  'scatter',
  'mortar',
  'marksman',
  'shotgun',
  'acid',
  'tesla',
  'launcher',
  'triple',
  'laser',
  'drone',
  'precision_mortar',
  'plasma',
  'ring',
];

/** How far from the player a new structure may be placed. */
export const PLACE_RANGE = 380;
/** How far a structure may be from the player to repair or sell it. */
export const DEFENSE_REACH = 92;
/** Money per repaired hit point. */
export const REPAIR_COST_PER_HP = 0.35;
/** Distance at which the placement preview snaps flush against a neighbour. */
export const SNAP_DISTANCE = 30;
/** A hair of slack so two structures may sit flush without counting as overlap. */
const TOUCH_SLACK = 1;

export interface PlacedDefense {
  type: DefenseType;
  x: number;
  y: number;
  rotation: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis aligned size of a structure; barricades may be turned by 90°. */
export function defenseFootprint(type: DefenseType, rotation: number) {
  const config = DEFENSES[type];
  const turned = Math.abs(Math.sin(rotation)) > 0.5;
  return {
    w: turned ? config.height : config.width,
    h: turned ? config.width : config.height,
  };
}

export function defenseBox(defense: PlacedDefense): Box {
  const size = defenseFootprint(defense.type, defense.rotation);
  return { x: defense.x, y: defense.y, w: size.w, h: size.h };
}

export function boxesOverlap(a: Box, b: Box) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 - TOUCH_SLACK &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 - TOUCH_SLACK
  );
}

/**
 * Structures block each other by their real rectangle, so a wall can be built
 * without gaps instead of keeping a fixed distance to the next piece.
 */
export function canPlaceDefense(
  candidate: PlacedDefense,
  existing: Iterable<PlacedDefense>,
  obstacles: readonly MapObstacle[],
) {
  const box = defenseBox(candidate);
  if (
    box.x - box.w / 2 < 30 ||
    box.x + box.w / 2 > ARENA.width - 30 ||
    box.y - box.h / 2 < 30 ||
    box.y + box.h / 2 > ARENA.height - 30
  ) {
    return false;
  }
  for (const rect of obstacles) if (boxesOverlap(box, rect)) return false;
  for (const other of existing) if (boxesOverlap(box, defenseBox(other))) return false;
  return true;
}

/**
 * Pulls the preview flush against a neighbour or a map obstacle so closed walls
 * are easy to build. Returns the original spot when nothing is close enough.
 */
export function snapDefense(
  candidate: PlacedDefense,
  existing: Iterable<PlacedDefense>,
  obstacles: readonly MapObstacle[],
): PlacedDefense {
  const size = defenseFootprint(candidate.type, candidate.rotation);
  const others = [...existing];
  let best = candidate;
  let bestDistance = SNAP_DISTANCE;

  const consider = (x: number, y: number) => {
    const distance = Math.hypot(x - candidate.x, y - candidate.y);
    if (distance >= bestDistance) return;
    const option = { ...candidate, x: Math.round(x), y: Math.round(y) };
    if (!canPlaceDefense(option, others, obstacles)) return;
    best = option;
    bestDistance = distance;
  };

  const neighbours: Box[] = [...others.map(defenseBox), ...obstacles];
  for (const box of neighbours) {
    if (Math.hypot(box.x - candidate.x, box.y - candidate.y) > 260) continue;
    const gapX = (size.w + box.w) / 2;
    const gapY = (size.h + box.h) / 2;
    consider(box.x - gapX, candidate.y);
    consider(box.x + gapX, candidate.y);
    consider(candidate.x, box.y - gapY);
    consider(candidate.x, box.y + gapY);
    consider(box.x - gapX, box.y);
    consider(box.x + gapX, box.y);
    consider(box.x, box.y - gapY);
    consider(box.x, box.y + gapY);
  }
  return best;
}

/** Distance from a point to the edge of a structure, 0 while standing on it. */
export function distanceToDefense(x: number, y: number, defense: PlacedDefense) {
  const size = defenseFootprint(defense.type, defense.rotation);
  return Math.hypot(
    Math.max(Math.abs(x - defense.x) - size.w / 2, 0),
    Math.max(Math.abs(y - defense.y) - size.h / 2, 0),
  );
}

export function repairCost(defense: { health: number; maxHealth: number }, discount = 0) {
  const missing = Math.max(0, defense.maxHealth - defense.health);
  return Math.ceil(missing * REPAIR_COST_PER_HP * (1 - discount));
}

/**
 * An undamaged structure always keeps its original shop value. Damage lowers
 * that value in the same proportion, and repairing it restores the full value.
 */
export function sellValue(type: DefenseType, health: number, maxHealth: number) {
  const condition = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  return Math.round(DEFENSES[type].cost * condition);
}
