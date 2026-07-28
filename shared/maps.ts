import { ARENA } from './arena.js';
import type { WaveDefinition } from './waves.js';
import { buildWaves, type SpawnPattern, type WavePlan } from './waves.js';
import type { ZombieType } from './zombies.js';

export type ObstacleKind =
  'car' | 'container' | 'crate' | 'rock' | 'barrel' | 'tree' | 'wall' | 'sandbag' | 'pipe' | 'ruin';

export type DecorKind = 'puddle' | 'crack' | 'grass' | 'bones' | 'blood' | 'rubble' | 'marking';

export interface MapObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ObstacleKind;
  rotation: number;
  /** blocks projectiles as well as bodies */
  solid: boolean;
}

export interface MapDecor {
  x: number;
  y: number;
  r: number;
  rotation: number;
  kind: DecorKind;
}

export interface MapTheme {
  ground: string;
  groundAlt: string;
  grid: string;
  accent: string;
  edge: string;
  fog: string;
}

export type MapMission =
  | {
      kind: 'survival';
      title: string;
      briefing: string;
    }
  | {
      kind: 'holdout';
      title: string;
      briefing: string;
      x: number;
      y: number;
      radius: number;
      maxHealth: number;
    }
  | {
      kind: 'escort';
      title: string;
      briefing: string;
      radius: number;
      maxHealth: number;
      speed: number;
      path: Array<{ x: number; y: number }>;
    };

export interface GameMap {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  /** scales zombie health and damage */
  difficulty: number;
  /** scales kill and wave money */
  moneyScale: number;
  /** permanent gold for beating the final boss */
  reward: number;
  /** The one boss this map ends with — every map has its own. */
  boss: ZombieType;
  theme: MapTheme;
  /** Optional campaign objective that changes how the map is won or lost. */
  mission?: MapMission;
  waves: WaveDefinition[];
  obstacles: MapObstacle[];
  decor: MapDecor[];
}

/** A failed campaign run can earn up to this share of the map's victory reward. */
export const DEFEAT_REWARD_SHARE = 0.6;
/** Consolation on top of everything a lost campaign run earned. */
export const DEFEAT_REWARD_BONUS = 0.2;
/** Campaign runs now pay roughly twice as much permanent gold at every depth. */
export const CAMPAIGN_REWARD_MULTIPLIER = 2;
/** Endless starts paying a survival bonus once the planned-map length is behind you. */
export const ENDLESS_REWARD_RAMP_WAVE = 10;

/**
 * Permanent gold for a campaign run.
 *
 * Reaching later waves pays a growing part of the map reward even on defeat,
 * while beating the boss still grants the full reward. Squaring the progress
 * keeps deliberately restarting early from becoming worthwhile. A lost run also
 * gets a flat bonus on top, so an evening that ends badly is still worth gold.
 */
export function campaignRunReward(map: GameMap, reachedWave: number, victory: boolean) {
  const wave = Math.max(0, Math.floor(reachedWave));
  const baseGold = (15 + wave * 12) * map.moneyScale;
  const progress = Math.min(1, wave / Math.max(1, map.waves.length));
  const mapGold = victory ? map.reward : map.reward * DEFEAT_REWARD_SHARE * progress * progress;
  const gold = baseGold + mapGold;
  const result = victory ? gold : gold * (1 + DEFEAT_REWARD_BONUS);
  return Math.round(result * CAMPAIGN_REWARD_MULTIPLIER);
}

/**
 * Permanent gold for an endless run.
 *
 * The familiar early reward stays intact. Past wave ten a quadratic survival
 * bonus makes long runs worthwhile: wave 50 on the first map pays 1,415 gold
 * instead of the old 615, while later maps still apply their money scale.
 */
export function endlessRunReward(map: GameMap, reachedWave: number) {
  const wave = Math.max(0, Math.floor(reachedWave));
  const lateWaves = Math.max(0, wave - ENDLESS_REWARD_RAMP_WAVE);
  return Math.round((15 + wave * 12 + lateWaves * lateWaves * 0.5) * map.moneyScale);
}

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTER_X = ARENA.width / 2;
const CENTER_Y = ARENA.height / 2;
/** The hand-placed structures were authored around the original map centre. */
const AUTHORED_CENTER_X = 1200;
const AUTHORED_CENTER_Y = 800;

const OBSTACLE_SIZES: Record<ObstacleKind, { w: number; h: number; solid: boolean }> = {
  car: { w: 116, h: 58, solid: true },
  container: { w: 190, h: 78, solid: true },
  crate: { w: 54, h: 54, solid: true },
  rock: { w: 76, h: 68, solid: true },
  barrel: { w: 42, h: 42, solid: false },
  tree: { w: 58, h: 58, solid: false },
  wall: { w: 210, h: 34, solid: true },
  sandbag: { w: 96, h: 40, solid: false },
  pipe: { w: 150, h: 44, solid: true },
  ruin: { w: 132, h: 118, solid: true },
};

function obstacle(kind: ObstacleKind, x: number, y: number, rotation = 0, scale = 1): MapObstacle {
  const size = OBSTACLE_SIZES[kind];
  const swap = Math.abs(Math.sin(rotation)) > 0.7;
  return {
    kind,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round((swap ? size.h : size.w) * scale),
    h: Math.round((swap ? size.w : size.h) * scale),
    rotation: swap ? Math.PI / 2 : 0,
    solid: size.solid,
  };
}

function fits(candidate: MapObstacle, placed: MapObstacle[]) {
  const clearCenter =
    Math.hypot(candidate.x - CENTER_X, candidate.y - CENTER_Y) >
    215 + Math.max(candidate.w, candidate.h) / 2;
  const insideArena =
    candidate.x - candidate.w / 2 > 90 &&
    candidate.x + candidate.w / 2 < ARENA.width - 90 &&
    candidate.y - candidate.h / 2 > 90 &&
    candidate.y + candidate.h / 2 < ARENA.height - 90;
  if (!clearCenter || !insideArena) return false;
  return !placed.some(
    (other) =>
      Math.abs(other.x - candidate.x) < (other.w + candidate.w) / 2 + 86 &&
      Math.abs(other.y - candidate.y) < (other.h + candidate.h) / 2 + 86,
  );
}

function scatter(
  base: MapObstacle[],
  kinds: ObstacleKind[],
  amount: number,
  seed: number,
): MapObstacle[] {
  const random = seeded(seed);
  // Keep authored formations centred when the shared arena gets a little larger.
  const placed = base.map((entry) => ({
    ...entry,
    x: entry.x + CENTER_X - AUTHORED_CENTER_X,
    y: entry.y + CENTER_Y - AUTHORED_CENTER_Y,
  }));
  let guard = 0;
  while (placed.length < base.length + amount && guard < amount * 60) {
    guard += 1;
    const kind = kinds[Math.floor(random() * kinds.length)];
    const candidate = obstacle(
      kind,
      130 + random() * (ARENA.width - 260),
      130 + random() * (ARENA.height - 260),
      random() > 0.55 ? Math.PI / 2 : 0,
      0.85 + random() * 0.35,
    );
    if (fits(candidate, placed)) placed.push(candidate);
  }
  return placed;
}

function decorate(seed: number, kinds: DecorKind[], amount: number): MapDecor[] {
  const random = seeded(seed);
  const list: MapDecor[] = [];
  for (let index = 0; index < amount; index += 1) {
    list.push({
      x: Math.round(60 + random() * (ARENA.width - 120)),
      y: Math.round(60 + random() * (ARENA.height - 120)),
      r: Math.round(24 + random() * 58),
      rotation: Number((random() * Math.PI * 2).toFixed(3)),
      kind: kinds[Math.floor(random() * kinds.length)],
    });
  }
  return list;
}

// --------------------------------------------------------------- structures

const OUTPOST_STRUCTURES: MapObstacle[] = [
  obstacle('container', 470, 330),
  obstacle('container', 1930, 1270),
  obstacle('car', 720, 1180, Math.PI / 2),
  obstacle('car', 1680, 430),
  obstacle('wall', 1200, 250),
  obstacle('wall', 1200, 1350),
  obstacle('sandbag', 940, 700),
  obstacle('sandbag', 1460, 900),
  obstacle('ruin', 350, 1150),
  obstacle('ruin', 2050, 470),
];

const HARBOR_STRUCTURES: MapObstacle[] = [
  obstacle('container', 380, 420),
  obstacle('container', 380, 620),
  obstacle('container', 620, 520, Math.PI / 2),
  obstacle('container', 2020, 1140),
  obstacle('container', 2020, 940),
  obstacle('pipe', 1200, 300),
  obstacle('pipe', 1200, 1300),
  obstacle('pipe', 860, 890, Math.PI / 2),
  obstacle('pipe', 1540, 710, Math.PI / 2),
  obstacle('wall', 1750, 400),
  obstacle('wall', 650, 1220),
  obstacle('crate', 1000, 1150),
  obstacle('crate', 1400, 440),
];

const BASE_STRUCTURES: MapObstacle[] = [
  obstacle('wall', 700, 300),
  obstacle('wall', 1700, 300),
  obstacle('wall', 700, 1300),
  obstacle('wall', 1700, 1300),
  obstacle('wall', 330, 800, Math.PI / 2),
  obstacle('wall', 2070, 800, Math.PI / 2),
  obstacle('container', 1200, 520),
  obstacle('container', 1200, 1080),
  obstacle('sandbag', 880, 800),
  obstacle('sandbag', 1520, 800),
  obstacle('car', 520, 520),
  obstacle('car', 1880, 1080),
  obstacle('ruin', 1880, 520),
  obstacle('ruin', 520, 1080),
];

const CRATER_STRUCTURES: MapObstacle[] = [
  obstacle('rock', 420, 380, 0, 1.4),
  obstacle('rock', 2000, 1220, 0, 1.4),
  obstacle('rock', 1200, 240, 0, 1.2),
  obstacle('rock', 1200, 1360, 0, 1.2),
  obstacle('ruin', 760, 900),
  obstacle('ruin', 1660, 700),
  obstacle('ruin', 1980, 380),
  obstacle('ruin', 430, 1230),
  obstacle('pipe', 1450, 1200, Math.PI / 2),
  obstacle('pipe', 960, 420, Math.PI / 2),
];

const SUBWAY_STRUCTURES: MapObstacle[] = [
  obstacle('wall', 600, 520),
  obstacle('wall', 1800, 520),
  obstacle('wall', 600, 1080),
  obstacle('wall', 1800, 1080),
  obstacle('pipe', 1200, 360),
  obstacle('pipe', 1200, 1240),
  obstacle('container', 340, 800),
  obstacle('container', 2060, 800),
  obstacle('container', 900, 300, Math.PI / 2),
  obstacle('container', 1500, 1300, Math.PI / 2),
  obstacle('ruin', 2040, 400),
  obstacle('ruin', 360, 1200),
  obstacle('sandbag', 960, 800),
  obstacle('sandbag', 1440, 800),
  obstacle('crate', 1200, 560),
];

const FOUNDRY_STRUCTURES: MapObstacle[] = [
  obstacle('ruin', 700, 470),
  obstacle('ruin', 1700, 470),
  obstacle('ruin', 700, 1130),
  obstacle('ruin', 1700, 1130),
  obstacle('pipe', 1200, 300),
  obstacle('pipe', 1200, 1300),
  obstacle('container', 400, 800),
  obstacle('container', 2000, 800),
  obstacle('wall', 950, 1050, Math.PI / 2),
  obstacle('wall', 1450, 550, Math.PI / 2),
  obstacle('barrel', 1000, 620),
  obstacle('barrel', 1400, 980),
  obstacle('crate', 380, 380),
  obstacle('crate', 2020, 1220),
  obstacle('rock', 1200, 1420),
];

const CITADEL_STRUCTURES: MapObstacle[] = [
  obstacle('wall', 880, 500),
  obstacle('wall', 1520, 500),
  obstacle('wall', 880, 1100),
  obstacle('wall', 1520, 1100),
  obstacle('wall', 640, 800, Math.PI / 2),
  obstacle('wall', 1760, 800, Math.PI / 2),
  obstacle('sandbag', 1200, 580),
  obstacle('sandbag', 1200, 1020),
  obstacle('container', 1200, 260),
  obstacle('container', 1200, 1340),
  obstacle('car', 460, 420),
  obstacle('car', 1940, 1180),
  obstacle('ruin', 1940, 420),
  obstacle('ruin', 460, 1180),
  obstacle('rock', 2120, 800),
  obstacle('rock', 280, 800),
];

const NECROPOLIS_STRUCTURES: MapObstacle[] = [
  obstacle('ruin', 520, 380),
  obstacle('ruin', 1880, 380),
  obstacle('ruin', 520, 1220),
  obstacle('ruin', 1880, 1220),
  obstacle('wall', 1200, 240),
  obstacle('wall', 1200, 1360),
  obstacle('wall', 300, 800, Math.PI / 2),
  obstacle('wall', 2100, 800, Math.PI / 2),
  obstacle('rock', 900, 620, 0, 1.3),
  obstacle('rock', 1500, 980, 0, 1.3),
  obstacle('rock', 900, 980, 0, 1.1),
  obstacle('rock', 1500, 620, 0, 1.1),
  obstacle('tree', 700, 800),
  obstacle('tree', 1700, 800),
  obstacle('crate', 1200, 520),
  obstacle('crate', 1200, 1080),
];

const REACTOR_STRUCTURES: MapObstacle[] = [
  obstacle('pipe', 760, 400, Math.PI / 2),
  obstacle('pipe', 1640, 400, Math.PI / 2),
  obstacle('pipe', 760, 1200, Math.PI / 2),
  obstacle('pipe', 1640, 1200, Math.PI / 2),
  obstacle('pipe', 1200, 280),
  obstacle('pipe', 1200, 1320),
  obstacle('container', 360, 620),
  obstacle('container', 360, 980),
  obstacle('container', 2040, 620),
  obstacle('container', 2040, 980),
  obstacle('barrel', 980, 700),
  obstacle('barrel', 1420, 900),
  obstacle('barrel', 980, 900),
  obstacle('barrel', 1420, 700),
  obstacle('wall', 1200, 620),
  obstacle('wall', 1200, 980),
  obstacle('ruin', 500, 300),
  obstacle('ruin', 1900, 1300),
];

const ABYSS_STRUCTURES: MapObstacle[] = [
  obstacle('wall', 820, 420),
  obstacle('wall', 1580, 420),
  obstacle('wall', 820, 1180),
  obstacle('wall', 1580, 1180),
  obstacle('wall', 520, 800, Math.PI / 2),
  obstacle('wall', 1880, 800, Math.PI / 2),
  obstacle('ruin', 300, 380),
  obstacle('ruin', 2100, 380),
  obstacle('ruin', 300, 1220),
  obstacle('ruin', 2100, 1220),
  obstacle('rock', 1200, 220, 0, 1.5),
  obstacle('rock', 1200, 1380, 0, 1.5),
  obstacle('container', 640, 800, Math.PI / 2),
  obstacle('container', 1760, 800, Math.PI / 2),
  obstacle('sandbag', 1200, 560),
  obstacle('sandbag', 1200, 1040),
  obstacle('crate', 960, 640),
  obstacle('crate', 1440, 960),
];

/** A deliberately cramped inner bunker with only four narrow breach lanes. */
const POCKET_STRUCTURES: MapObstacle[] = [
  obstacle('wall', 760, 510),
  obstacle('wall', 1640, 510),
  obstacle('wall', 760, 1090),
  obstacle('wall', 1640, 1090),
  obstacle('wall', 650, 690, Math.PI / 2),
  obstacle('wall', 650, 930, Math.PI / 2),
  obstacle('wall', 1750, 690, Math.PI / 2),
  obstacle('wall', 1750, 930, Math.PI / 2),
  obstacle('container', 420, 800, Math.PI / 2),
  obstacle('container', 1980, 800, Math.PI / 2),
  obstacle('ruin', 430, 350),
  obstacle('ruin', 1970, 1250),
];

/** Cover points around a clear relay core that must stay alive. */
const RELAY_STRUCTURES: MapObstacle[] = [
  obstacle('wall', 820, 520, 0, 0.85),
  obstacle('wall', 1580, 520, 0, 0.85),
  obstacle('wall', 820, 1080, 0, 0.85),
  obstacle('wall', 1580, 1080, 0, 0.85),
  obstacle('wall', 600, 800, Math.PI / 2, 0.85),
  obstacle('wall', 1800, 800, Math.PI / 2, 0.85),
  obstacle('container', 350, 410),
  obstacle('container', 2050, 1190),
  obstacle('pipe', 1200, 250),
  obstacle('pipe', 1200, 1350),
  obstacle('ruin', 380, 1210),
  obstacle('ruin', 2020, 390),
];

/** A long causeway: almost every wave has a readable attack direction. */
const CAUSEWAY_STRUCTURES: MapObstacle[] = [
  obstacle('container', 520, 430),
  obstacle('container', 920, 430),
  obstacle('container', 1480, 430),
  obstacle('container', 1880, 430),
  obstacle('container', 520, 1170),
  obstacle('container', 920, 1170),
  obstacle('container', 1480, 1170),
  obstacle('container', 1880, 1170),
  obstacle('wall', 780, 650, Math.PI / 2),
  obstacle('wall', 1620, 950, Math.PI / 2),
  obstacle('pipe', 1180, 330),
  obstacle('pipe', 1220, 1270),
  obstacle('car', 980, 690),
  obstacle('car', 1420, 910),
];

/** Broken roadside cover leaves one continuous route for the mission wagon. */
const CONVOY_STRUCTURES: MapObstacle[] = [
  obstacle('container', 560, 410),
  obstacle('container', 1040, 420),
  obstacle('container', 1540, 420),
  obstacle('container', 2020, 430),
  obstacle('container', 430, 1210),
  obstacle('container', 920, 1200),
  obstacle('container', 1430, 1210),
  obstacle('container', 1940, 1200),
  obstacle('wall', 720, 610),
  obstacle('wall', 1680, 990),
  obstacle('car', 880, 710),
  obstacle('car', 1510, 880),
  obstacle('ruin', 220, 330),
  obstacle('ruin', 2180, 1270),
  obstacle('sandbag', 1180, 560),
  obstacle('sandbag', 1280, 1100),
];

/** The finale uses offset rings and diagonal sightline breaks. */
const ECLIPSE_STRUCTURES: MapObstacle[] = [
  obstacle('ruin', 520, 420),
  obstacle('ruin', 1880, 420),
  obstacle('ruin', 520, 1180),
  obstacle('ruin', 1880, 1180),
  obstacle('wall', 850, 560, Math.PI / 2),
  obstacle('wall', 1550, 1040, Math.PI / 2),
  obstacle('wall', 1550, 560),
  obstacle('wall', 850, 1040),
  obstacle('rock', 1200, 260, 0, 1.55),
  obstacle('rock', 1200, 1340, 0, 1.55),
  obstacle('rock', 300, 800, 0, 1.35),
  obstacle('rock', 2100, 800, 0, 1.35),
  obstacle('pipe', 1050, 470, Math.PI / 2),
  obstacle('pipe', 1350, 1130, Math.PI / 2),
];

// ---------------------------------------------------------------- wave plans

/** Which enemies a map sends and from which wave on they show up. */
const EARLY_ROSTER: WavePlan['roster'] = [
  { type: 'normal', from: 1, share: 5 },
  { type: 'fast', from: 2, share: 3 },
  { type: 'exploder', from: 3, share: 1 },
  { type: 'crawler', from: 3, share: 2 },
  { type: 'big', from: 4, share: 1 },
];

const MID_ROSTER: WavePlan['roster'] = [
  { type: 'normal', from: 1, share: 4 },
  { type: 'fast', from: 1, share: 3 },
  { type: 'crawler', from: 1, share: 3 },
  { type: 'exploder', from: 1, share: 1.4 },
  { type: 'big', from: 1, share: 1.2 },
  { type: 'armored', from: 2, share: 1 },
  { type: 'spitter', from: 3, share: 0.8 },
  { type: 'screamer', from: 5, share: 0.6 },
];

const LATE_ROSTER: WavePlan['roster'] = [
  { type: 'normal', from: 1, share: 3 },
  { type: 'fast', from: 1, share: 3 },
  { type: 'crawler', from: 1, share: 3.4 },
  { type: 'exploder', from: 1, share: 1.6 },
  { type: 'big', from: 1, share: 1.4 },
  { type: 'armored', from: 1, share: 1.6 },
  { type: 'spitter', from: 1, share: 1.2 },
  { type: 'screamer', from: 2, share: 1 },
];

/** Cheap bodies dominate these late missions; the pressure is in their count. */
const SWARM_ROSTER: WavePlan['roster'] = [
  { type: 'crawler', from: 1, share: 7 },
  { type: 'fast', from: 1, share: 5 },
  { type: 'normal', from: 1, share: 2 },
  { type: 'exploder', from: 3, share: 0.8 },
  { type: 'spitter', from: 5, share: 0.6 },
  { type: 'screamer', from: 7, share: 0.55 },
  { type: 'armored', from: 9, share: 0.5 },
];

/** Heavy escorts punish a squad that only builds for raw crowd control. */
const SIEGE_ROSTER: WavePlan['roster'] = [
  { type: 'normal', from: 1, share: 2 },
  { type: 'fast', from: 1, share: 2.4 },
  { type: 'crawler', from: 1, share: 2.8 },
  { type: 'exploder', from: 1, share: 2.2 },
  { type: 'big', from: 1, share: 2 },
  { type: 'armored', from: 1, share: 2.8 },
  { type: 'spitter', from: 1, share: 1.4 },
  { type: 'screamer', from: 1, share: 1.2 },
];

function patternedWaves(waves: number, patterns: SpawnPattern[]) {
  const result: Partial<Record<number, SpawnPattern>> = {};
  for (let wave = 1; wave <= waves; wave += 1) {
    result[wave] = patterns[(wave - 1) % patterns.length];
  }
  return result;
}

// -------------------------------------------------------------------- maps

export const MAPS: GameMap[] = [
  {
    id: 'outpost',
    name: 'Vorposten 07',
    subtitle: 'Äußere Verteidigungszone',
    description:
      'Ruhiger Einstieg mit offenen Sichtlinien. Zehn Wellen, zwei Mini-Boss-Wellen und der Fleischkönig als erster Endboss.',
    difficulty: 1,
    moneyScale: 1,
    reward: 200,
    boss: 'butcher',
    theme: {
      ground: '#101c16',
      groundAlt: '#152419',
      grid: '#1d2f26',
      accent: '#69f0ae',
      edge: '#284238',
      fog: '#05100c',
    },
    waves: buildWaves({
      waves: 10,
      boss: 'butcher',
      base: 15,
      step: 4.6,
      minis: ['brute'],
      miniWaves: [5, 9],
      swarmWaves: [],
      roster: EARLY_ROSTER,
      seed: 1301,
    }),
    obstacles: scatter(OUTPOST_STRUCTURES, ['crate', 'barrel', 'tree', 'rock'], 16, 4711),
    decor: decorate(9021, ['grass', 'crack', 'puddle', 'marking', 'rubble'], 90),
  },
  {
    id: 'harbor',
    name: 'Industriehafen',
    subtitle: 'Containerterminal bei Nacht',
    description:
      'Enge Gassen zwischen Containern. Zwölf Wellen, eine Schwarmwelle und die Brutmutter, die sich beim Sterben teilt.',
    difficulty: 1.45,
    moneyScale: 1.25,
    reward: 400,
    boss: 'brood',
    theme: {
      ground: '#0f1720',
      groundAlt: '#141f2a',
      grid: '#1c2a36',
      accent: '#57b8ff',
      edge: '#2a3f52',
      fog: '#060d14',
    },
    waves: buildWaves({
      waves: 12,
      boss: 'brood',
      base: 20,
      step: 5.4,
      minis: ['brute', 'stalker'],
      miniWaves: [4, 8, 11],
      swarmWaves: [6],
      roster: MID_ROSTER,
      seed: 1451,
    }),
    obstacles: scatter(HARBOR_STRUCTURES, ['crate', 'barrel', 'pipe', 'car'], 18, 22315),
    decor: decorate(5512, ['puddle', 'crack', 'rubble', 'marking', 'blood'], 110),
  },
  {
    id: 'base',
    name: 'Militärbasis Nord',
    subtitle: 'Gefallene Garnison',
    description:
      'Befestigte Stellungen mit langen Feuergassen. Vierzehn Wellen und der Feldmarschall, der sich und seine Horde heilt.',
    difficulty: 2,
    moneyScale: 1.5,
    reward: 750,
    boss: 'warlord',
    theme: {
      ground: '#1a170f',
      groundAlt: '#221d13',
      grid: '#2c2618',
      accent: '#ffcc66',
      edge: '#4a3d22',
      fog: '#100c06',
    },
    waves: buildWaves({
      waves: 14,
      boss: 'warlord',
      base: 26,
      step: 5.8,
      minis: ['brute', 'warden', 'stalker'],
      miniWaves: [4, 8, 12],
      swarmWaves: [6, 10],
      roster: MID_ROSTER,
      seed: 2003,
    }),
    obstacles: scatter(BASE_STRUCTURES, ['crate', 'barrel', 'sandbag', 'rock'], 20, 78311),
    decor: decorate(3391, ['crack', 'rubble', 'marking', 'bones', 'blood'], 120),
  },
  {
    id: 'crater',
    name: 'Krater-Quarantäne',
    subtitle: 'Ground Zero',
    description:
      'Offenes Feld ohne Deckung. Sechzehn Wellen und der Artillerist, dessen Bomben sich mit roten Warnkreisen ankündigen.',
    difficulty: 2.8,
    moneyScale: 1.8,
    reward: 1250,
    boss: 'artillery',
    theme: {
      ground: '#1b1116',
      groundAlt: '#24161c',
      grid: '#33202a',
      accent: '#ff6577',
      edge: '#54293a',
      fog: '#12070c',
    },
    waves: buildWaves({
      waves: 16,
      boss: 'artillery',
      base: 32,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [4, 8, 12, 15],
      swarmWaves: [6, 13],
      roster: MID_ROSTER,
      seed: 2801,
    }),
    obstacles: scatter(CRATER_STRUCTURES, ['rock', 'barrel', 'crate', 'ruin'], 22, 60127),
    decor: decorate(7714, ['crack', 'blood', 'bones', 'rubble', 'puddle'], 130),
  },
  {
    id: 'subway',
    name: 'Metro Sektor 9',
    subtitle: 'Stillgelegte Tunnelkreuzung',
    description:
      'Bahnsteige und blockierte Gleise. Siebzehn Wellen und der Sogfürst, der den Trupp zu sich zieht und wieder wegschleudert.',
    difficulty: 3.6,
    moneyScale: 2.15,
    reward: 1900,
    boss: 'vortex',
    theme: {
      ground: '#0d1418',
      groundAlt: '#121d22',
      grid: '#1b2b31',
      accent: '#4ce0d5',
      edge: '#26424a',
      fog: '#050b0e',
    },
    waves: buildWaves({
      waves: 17,
      boss: 'vortex',
      base: 36,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [4, 8, 12, 15],
      swarmWaves: [6, 10, 14],
      roster: LATE_ROSTER,
      seed: 3601,
    }),
    obstacles: scatter(SUBWAY_STRUCTURES, ['crate', 'barrel', 'pipe', 'rock'], 20, 41209),
    decor: decorate(8123, ['crack', 'rubble', 'puddle', 'marking', 'bones'], 130),
  },
  {
    id: 'foundry',
    name: 'Stahlwerk Kessel 3',
    subtitle: 'Glühende Gießhalle',
    description:
      'Enge Gänge zwischen Hochöfen. Achtzehn Wellen und der Schlackenherr, der brennende Lavapfützen hinterlässt.',
    difficulty: 4.4,
    moneyScale: 2.5,
    reward: 2600,
    boss: 'slag',
    theme: {
      ground: '#1d120c',
      groundAlt: '#281710',
      grid: '#3a2015',
      accent: '#ff8f4a',
      edge: '#5c2f18',
      fog: '#0e0703',
    },
    waves: buildWaves({
      waves: 18,
      boss: 'slag',
      base: 38,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [4, 8, 11, 14, 17],
      swarmWaves: [6, 13],
      roster: LATE_ROSTER,
      seed: 4401,
    }),
    obstacles: scatter(FOUNDRY_STRUCTURES, ['barrel', 'crate', 'pipe', 'ruin'], 20, 55841),
    decor: decorate(6608, ['crack', 'rubble', 'marking', 'blood', 'bones'], 135),
  },
  {
    id: 'citadel',
    name: 'Zitadelle Alpha',
    subtitle: 'Letzte Bastion',
    description:
      'Zwanzig Wellen im Festungsring. Der Zerreißer schlägt mit einer gewaltigen Druckwelle zu — der rote Kreis ist die einzige Warnung.',
    difficulty: 5.2,
    moneyScale: 2.9,
    reward: 3750,
    boss: 'render',
    theme: {
      ground: '#131722',
      groundAlt: '#1a1f2d',
      grid: '#252c3d',
      accent: '#b58cff',
      edge: '#3b3355',
      fog: '#07090f',
    },
    waves: buildWaves({
      waves: 20,
      boss: 'render',
      base: 42,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [4, 7, 10, 13, 16, 19],
      swarmWaves: [6, 12, 17],
      roster: LATE_ROSTER,
      seed: 5201,
    }),
    obstacles: scatter(CITADEL_STRUCTURES, ['sandbag', 'crate', 'rock', 'car'], 22, 90733),
    decor: decorate(4470, ['marking', 'crack', 'rubble', 'blood', 'bones'], 140),
  },
  {
    id: 'necropolis',
    name: 'Nekropole',
    subtitle: 'Gräberfeld der ersten Welle',
    description:
      'Eine bewusst kompakte Grabstadt mit kurzen Fluchtwegen. Zweiundzwanzig Wellen, dichter Schwarmdruck und kaum Platz für endlose Turmreihen.',
    difficulty: 6,
    moneyScale: 3.3,
    reward: 5250,
    boss: 'swarmqueen',
    theme: {
      ground: '#141319',
      groundAlt: '#1c1a23',
      grid: '#2a2634',
      accent: '#9be36f',
      edge: '#3d3a4c',
      fog: '#08070b',
    },
    mission: {
      kind: 'survival',
      title: 'Kompakt-Arena',
      briefing: 'Kurze Wege, enge Grabgassen und Angriffe, die schnell im Zentrum stehen.',
    },
    waves: buildWaves({
      waves: 22,
      boss: 'swarmqueen',
      base: 46,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21],
      swarmWaves: [5, 11, 17, 20],
      roster: LATE_ROSTER,
      seed: 6001,
    }),
    obstacles: scatter(NECROPOLIS_STRUCTURES, ['rock', 'tree', 'crate', 'ruin'], 32, 71255),
    decor: decorate(2277, ['bones', 'crack', 'rubble', 'grass', 'blood'], 145),
  },
  {
    id: 'reactor',
    name: 'Reaktorblock 4',
    subtitle: 'Kühlkreis im Notbetrieb',
    description:
      'Eine ungewohnt weite, offene Reaktorfläche mit langen Lauf- und Schusswegen. Der Seuchenfürst zwingt den Trupp trotzdem ständig aus seiner Stellung.',
    difficulty: 6.8,
    moneyScale: 3.7,
    reward: 7250,
    boss: 'plague',
    theme: {
      ground: '#0e1a13',
      groundAlt: '#13251a',
      grid: '#1d3625',
      accent: '#8dff6b',
      edge: '#2c5236',
      fog: '#050d08',
    },
    mission: {
      kind: 'survival',
      title: 'Offenes Großfeld',
      briefing: 'Wenig feste Deckung, lange Sichtlinien und viel Raum für mobile Verteidigung.',
    },
    waves: buildWaves({
      waves: 24,
      boss: 'plague',
      base: 50,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 23],
      swarmWaves: [5, 11, 17, 22],
      roster: LATE_ROSTER,
      seed: 6801,
    }),
    obstacles: scatter(
      REACTOR_STRUCTURES.slice(0, 12),
      ['barrel', 'pipe', 'crate', 'container'],
      7,
      83117,
    ),
    decor: decorate(1188, ['puddle', 'crack', 'marking', 'rubble', 'blood'], 150),
  },
  {
    id: 'abyss',
    name: 'Abgrund-Kathedrale',
    subtitle: 'Wo alles herkam',
    description:
      'Die alte Endlinie mit sechsundzwanzig Wellen. OMEGA bringt fast jede Fähigkeit der bisherigen Bosse mit — heilen kann es sich als einziges nicht.',
    difficulty: 7.6,
    moneyScale: 4.2,
    reward: 11250,
    boss: 'omega',
    theme: {
      ground: '#16101a',
      groundAlt: '#1f1526',
      grid: '#2f2038',
      accent: '#ff5fd0',
      edge: '#4c2a5a',
      fog: '#0a060d',
    },
    waves: buildWaves({
      waves: 26,
      boss: 'omega',
      base: 54,
      step: 6,
      minis: ['brute', 'warden', 'stalker', 'mortar'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 24],
      swarmWaves: [5, 11, 17, 23, 25],
      roster: LATE_ROSTER,
      seed: 7601,
    }),
    obstacles: scatter(ABYSS_STRUCTURES, ['rock', 'crate', 'sandbag', 'ruin'], 22, 95531),
    decor: decorate(3355, ['blood', 'bones', 'crack', 'rubble', 'marking'], 155),
  },
  {
    id: 'pocket',
    name: 'Bunker K-11',
    subtitle: 'Die Schließkammer',
    description:
      'Eine winzige Kampfzone mit vier schmalen Einbrüchen. Ganze Kriecherteppiche kommen eng gepackt aus nur einer oder zwei Richtungen.',
    difficulty: 8.4,
    moneyScale: 4.65,
    reward: 14500,
    boss: 'bastion',
    theme: {
      ground: '#16191b',
      groundAlt: '#1e2326',
      grid: '#2d3438',
      accent: '#ffbd59',
      edge: '#4b555d',
      fog: '#080a0b',
    },
    mission: {
      kind: 'survival',
      title: 'Killbox',
      briefing: 'Kaum Platz, dafür klar lesbare Einbruchskorridore und extrem dichte Kleinwellen.',
    },
    waves: buildWaves({
      waves: 28,
      boss: 'bastion',
      base: 58,
      step: 5.7,
      minis: ['stalker', 'brute', 'mortar', 'warden'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 24, 27],
      swarmWaves: [4, 7, 10, 13, 16, 19, 22, 25],
      roster: SWARM_ROSTER,
      seed: 8401,
      spawnPatterns: {
        ...patternedWaves(28, ['north-south']),
        4: 'west',
        7: 'east',
        10: 'north',
        13: 'south',
        16: 'west',
        19: 'east',
        22: 'north',
        25: 'south',
      },
      spawnDelayScales: {
        4: 0.3,
        7: 0.3,
        10: 0.28,
        13: 0.28,
        16: 0.26,
        19: 0.26,
        22: 0.24,
        25: 0.22,
      },
      labels: {
        4: 'KRIECHERTEPPICH',
        10: 'NORDSTURM',
        16: 'WESTBRUCH',
        22: 'KLEINVIEH-FLUT',
      },
    }),
    obstacles: scatter(POCKET_STRUCTURES, ['crate', 'barrel', 'sandbag'], 9, 104729),
    decor: decorate(10111, ['marking', 'crack', 'rubble', 'blood'], 120),
  },
  {
    id: 'relay',
    name: 'Relais Helios',
    subtitle: 'Notruf im Niemandsland',
    description:
      'Haltet den Signalkern am Leben. Die Horde kreist von Welle zu Welle um die Stellung, während Sirene Null ihre Angreifer antreibt.',
    difficulty: 9.2,
    moneyScale: 5.05,
    reward: 18000,
    boss: 'siren',
    theme: {
      ground: '#0d181c',
      groundAlt: '#122228',
      grid: '#1b333b',
      accent: '#67f6ff',
      edge: '#2b5360',
      fog: '#040c0f',
    },
    mission: {
      kind: 'holdout',
      title: 'Signalkern verteidigen',
      briefing:
        'Der Kern steht im Zentrum. Gegner greifen ihn direkt an; fällt er, ist die Mission verloren.',
      x: CENTER_X,
      y: CENTER_Y,
      radius: 62,
      maxHealth: 16000,
    },
    waves: buildWaves({
      waves: 28,
      boss: 'siren',
      base: 60,
      step: 5.8,
      minis: ['mortar', 'stalker', 'warden', 'brute'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 24, 27],
      swarmWaves: [5, 11, 17, 23, 26],
      roster: LATE_ROSTER,
      seed: 9201,
      spawnPatterns: patternedWaves(28, ['north', 'east', 'south', 'west']),
      spawnDelayScales: { 5: 0.36, 11: 0.34, 17: 0.32, 23: 0.3, 26: 0.28 },
      labels: { 7: 'OSTFLANKE', 14: 'SÜDFLANKE', 21: 'WESTFLANKE', 27: 'LETZTER RING' },
    }),
    obstacles: scatter(RELAY_STRUCTURES, ['crate', 'barrel', 'rock', 'sandbag'], 13, 117017),
    decor: decorate(12012, ['marking', 'puddle', 'crack', 'rubble'], 145),
  },
  {
    id: 'causeway',
    name: 'Damm 13',
    subtitle: 'Der lange Durchbruch',
    description:
      'Eine langgezogene Feuerstraße. Angriffe wechseln fast immer zwischen West und Ost; nur Schwärme brechen überraschend über eine einzelne Flanke herein.',
    difficulty: 10,
    moneyScale: 5.5,
    reward: 22500,
    boss: 'tunneler',
    theme: {
      ground: '#19160f',
      groundAlt: '#241f14',
      grid: '#352d1d',
      accent: '#a8ff63',
      edge: '#594b28',
      fog: '#0d0a04',
    },
    mission: {
      kind: 'survival',
      title: 'Frontwechsel',
      briefing:
        'West und Ost wechseln sich ab. Schwarmwellen konzentrieren sich auf nur eine Seite.',
    },
    waves: buildWaves({
      waves: 29,
      boss: 'tunneler',
      base: 62,
      step: 5.8,
      minis: ['brute', 'stalker', 'mortar', 'warden'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 24, 27],
      swarmWaves: [5, 10, 16, 22, 26],
      roster: SIEGE_ROSTER,
      seed: 10001,
      spawnPatterns: {
        ...patternedWaves(29, ['west', 'east']),
        5: 'north',
        10: 'south',
        16: 'north',
        22: 'south',
        26: 'west',
      },
      spawnDelayScales: { 5: 0.32, 10: 0.3, 16: 0.28, 22: 0.26, 26: 0.24 },
      labels: {
        5: 'NORDFLUT',
        10: 'SÜDFLUT',
        16: 'DAMMBRUCH',
        22: 'GEGENSTURM',
        26: 'WESTWAND',
      },
    }),
    obstacles: scatter(CAUSEWAY_STRUCTURES, ['crate', 'barrel', 'car', 'sandbag'], 11, 130027),
    decor: decorate(13013, ['crack', 'marking', 'rubble', 'puddle', 'blood'], 150),
  },
  {
    id: 'convoy',
    name: 'Route Lazarus',
    subtitle: 'Der letzte Konvoi',
    description:
      'Eskortiert den gepanzerten Wagen quer durch die Arena. Er fährt auch allein langsam weiter, mit Begleitschutz aber doppelt so schnell.',
    difficulty: 10.9,
    moneyScale: 6,
    reward: 28000,
    boss: 'roadking',
    theme: {
      ground: '#1b1210',
      groundAlt: '#271916',
      grid: '#39231e',
      accent: '#ff6f45',
      edge: '#5f352a',
      fog: '#0f0705',
    },
    mission: {
      kind: 'escort',
      title: 'Konvoi eskortieren',
      briefing:
        'Der Wagen muss pro Welle einen Streckenabschnitt schaffen. Bleibt in seiner Nähe und haltet Angreifer fern.',
      radius: 58,
      maxHealth: 30000,
      speed: 62,
      path: [
        { x: 420, y: 820 },
        { x: 720, y: 820 },
        { x: 1040, y: 760 },
        { x: 1370, y: 900 },
        { x: 1710, y: 820 },
        { x: 2200, y: 820 },
      ],
    },
    waves: buildWaves({
      waves: 30,
      boss: 'roadking',
      base: 65,
      step: 5.7,
      minis: ['mortar', 'stalker', 'brute', 'warden'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 24, 27, 29],
      swarmWaves: [5, 11, 17, 23, 28],
      roster: SIEGE_ROSTER,
      seed: 10901,
      spawnPatterns: patternedWaves(30, ['north-south', 'east-west', 'clockwise']),
      spawnDelayScales: { 5: 0.34, 11: 0.32, 17: 0.3, 23: 0.28, 28: 0.24 },
      labels: {
        6: 'BLOCKADE',
        12: 'HINTERHALT',
        18: 'KREUZFEUER',
        24: 'TODESKORRIDOR',
        29: 'LETZTE AUSFAHRT',
      },
    }),
    obstacles: scatter(
      CONVOY_STRUCTURES.map((entry) => (entry.kind === 'car' ? { ...entry, solid: false } : entry)),
      ['barrel', 'sandbag', 'tree'],
      12,
      141041,
    ),
    decor: decorate(14014, ['marking', 'crack', 'rubble', 'blood', 'bones'], 160),
  },
  {
    id: 'eclipse',
    name: 'Eklipsen-Riss',
    subtitle: 'Jenseits der Endlinie',
    description:
      'Die finale Arena dreht ihre Einbruchsseite mit jeder Welle weiter. Feuer, Gift, Gravitation und Elitehorden gipfeln im Kampf gegen EKLIPSE.',
    difficulty: 11.8,
    moneyScale: 6.7,
    reward: 36000,
    boss: 'eclipse',
    theme: {
      ground: '#100d1d',
      groundAlt: '#18122a',
      grid: '#261c40',
      accent: '#ff477e',
      edge: '#513069',
      fog: '#05030b',
    },
    mission: {
      kind: 'survival',
      title: 'Rotierende Apokalypse',
      briefing: 'Die Angriffsrichtung wandert im Uhrzeigersinn; Spezialwellen brechen das Muster.',
    },
    waves: buildWaves({
      waves: 32,
      boss: 'eclipse',
      base: 70,
      step: 5.5,
      minis: ['warden', 'mortar', 'stalker', 'brute'],
      miniWaves: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 31],
      swarmWaves: [4, 8, 13, 17, 22, 26, 29],
      roster: SIEGE_ROSTER,
      seed: 11801,
      spawnPatterns: patternedWaves(32, ['north', 'east', 'south', 'west']),
      spawnDelayScales: {
        4: 0.34,
        8: 0.32,
        13: 0.3,
        17: 0.28,
        22: 0.26,
        26: 0.24,
        29: 0.22,
      },
      labels: {
        4: 'FINSTERNIS',
        8: 'BLUTMOND',
        13: 'GIFTSTURM',
        17: 'FEUERREGEN',
        22: 'SCHWERKRAFTBRUCH',
        26: 'ELITEFLUT',
        29: 'DAS LETZTE LICHT',
      },
    }),
    obstacles: scatter(ECLIPSE_STRUCTURES, ['rock', 'ruin', 'crate', 'pipe'], 18, 155051),
    decor: decorate(15015, ['blood', 'bones', 'crack', 'rubble', 'puddle'], 175),
  },
];

export const DEFAULT_MAP_ID = MAPS[0].id;

export function findMap(id: string | undefined | null): GameMap {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}

export function mapIndex(id: string): number {
  const index = MAPS.findIndex((map) => map.id === id);
  return index < 0 ? 0 : index;
}
