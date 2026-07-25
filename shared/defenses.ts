import { ARENA } from './arena.js';
import type { MapObstacle } from './maps.js';

export type DefenseType =
  | 'wood'
  | 'stone'
  | 'spike'
  | 'steel'
  | 'mg'
  | 'flame'
  | 'marksman'
  | 'tesla'
  | 'launcher'
  | 'laser';

export interface DefenseConfig {
  label: string;
  short: string;
  kind: 'barricade' | 'turret';
  cost: number;
  health: number;
  width: number;
  height: number;
  /** damage dealt back to attacking zombies */
  thorns?: number;
  /** slows zombies that attack it */
  slow?: number;
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
  tesla: {
    label: 'Blitzturm',
    short: '⚡',
    kind: 'turret',
    cost: 1900,
    health: 320,
    width: 48,
    height: 48,
    damage: 44,
    fireDelay: 0.85,
    range: 520,
    speed: 1300,
    pierce: 0,
    chain: 3,
    chainRange: 190,
    description: 'Blitz springt auf drei Nachbarn über',
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
};

export const BARRICADE_ORDER: DefenseType[] = ['wood', 'spike', 'stone', 'steel'];
export const TURRET_ORDER: DefenseType[] = [
  'mg',
  'flame',
  'marksman',
  'tesla',
  'launcher',
  'laser',
];

/** How far from the player a new structure may be placed. */
export const PLACE_RANGE = 380;
/** How far a structure may be from the player to repair or sell it. */
export const DEFENSE_REACH = 92;
/** Money per repaired hit point. */
export const REPAIR_COST_PER_HP = 0.35;
/** Share of the build price paid back when selling. */
export const SELL_REFUND = 0.7;
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

interface Box {
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

function defenseBox(defense: PlacedDefense): Box {
  const size = defenseFootprint(defense.type, defense.rotation);
  return { x: defense.x, y: defense.y, w: size.w, h: size.h };
}

function boxesOverlap(a: Box, b: Box) {
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

export function repairCost(
  defense: { health: number; maxHealth: number },
  discount = 0,
) {
  const missing = Math.max(0, defense.maxHealth - defense.health);
  return Math.ceil(missing * REPAIR_COST_PER_HP * (1 - discount));
}

export function sellRefund(type: DefenseType) {
  return Math.round(DEFENSES[type].cost * SELL_REFUND);
}

/**
 * A structure put down in the current build phase can be taken back for what it
 * cost, so a misplaced wall is not a punishment. From the next wave on, selling
 * pays the usual share.
 */
export function sellValue(type: DefenseType, fresh: boolean) {
  return fresh ? DEFENSES[type].cost : sellRefund(type);
}
