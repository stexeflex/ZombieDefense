export type GamePhase = 'lobby' | 'combat' | 'build' | 'gameover';

export type ZombieType = 'normal' | 'fast' | 'big' | 'exploder' | 'brute' | 'boss';

export type WeaponType =
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'flamer'
  | 'rocket'
  | 'tesla'
  | 'laser';

export type DefenseType = 'wood' | 'stone' | 'spike' | 'steel' | 'mg' | 'marksman' | 'launcher';

export type ObstacleKind =
  | 'car'
  | 'container'
  | 'crate'
  | 'rock'
  | 'barrel'
  | 'tree'
  | 'wall'
  | 'sandbag'
  | 'pipe'
  | 'ruin';

export type DecorKind = 'puddle' | 'crack' | 'grass' | 'bones' | 'blood' | 'rubble' | 'marking';

export type FxKind =
  | 'hit'
  | 'blood'
  | 'death'
  | 'explosion'
  | 'burn'
  | 'chain'
  | 'muzzle'
  | 'structure'
  | 'wreck'
  | 'boss'
  | 'heal';

export interface FxEvent {
  k: FxKind;
  x: number;
  y: number;
  /** optional second point, used by chain lightning */
  x2?: number;
  y2?: number;
  /** radius or size hint */
  r?: number;
  /** angle hint */
  a?: number;
  /** subtype, e.g. weapon or zombie type */
  s?: string;
}

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
  firing: number;
  hurt: number;
}

export interface ZombieSnapshot {
  id: string;
  type: ZombieType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  rotation: number;
  burning: number;
  attacking: number;
  charging: number;
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
  mapId: string;
  wave: number;
  totalWaves: number;
  waveLabel: string;
  waveKind: WaveKind;
  enemiesRemaining: number;
  nextWaveIn: number;
  statusText: string;
  bossName: string;
  bossHealth: number;
  bossMaxHealth: number;
  players: Record<string, PlayerSnapshot>;
  zombies: Record<string, ZombieSnapshot>;
  projectiles: Record<string, ProjectileSnapshot>;
  defenses: Record<string, DefenseSnapshot>;
  fx?: FxEvent[];
}

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
  reload: boolean;
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
  armor: number;
  income: number;
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
  armor: 0,
  income: 0,
};

export const UPGRADE_MAX_LEVEL = 20;

export const ARENA = {
  width: 2400,
  height: 1600,
  padding: 52,
} as const;

export const VIEWPORT = {
  width: 1280,
  height: 720,
} as const;

export const PLAYER_BASE_SPEED = 205;
export const PLAYER_RADIUS = 18;
export const REVIVE_RADIUS = 74;
export const REVIVE_SECONDS = 1.6;
export const BUILD_SECONDS = 90;
export const START_MONEY = 400;

export interface ZombieConfig {
  label: string;
  health: number;
  speed: number;
  damage: number;
  radius: number;
  reward: number;
  /** score/health bar rendering hint */
  rank: 'trash' | 'elite' | 'mini' | 'boss';
  explode?: { radius: number; damage: number };
  charge?: { speed: number; every: number; duration: number };
  slam?: { radius: number; damage: number; every: number };
  summon?: { count: number; every: number; type: ZombieType };
}

export const ZOMBIES: Record<ZombieType, ZombieConfig> = {
  normal: {
    label: 'Läufer',
    health: 62,
    speed: 74,
    damage: 12,
    radius: 18,
    reward: 12,
    rank: 'trash',
  },
  fast: {
    label: 'Renner',
    health: 40,
    speed: 132,
    damage: 9,
    radius: 14,
    reward: 15,
    rank: 'trash',
  },
  big: {
    label: 'Koloss',
    health: 360,
    speed: 46,
    damage: 32,
    radius: 29,
    reward: 48,
    rank: 'elite',
  },
  exploder: {
    label: 'Sprengling',
    health: 90,
    speed: 96,
    damage: 0,
    radius: 20,
    reward: 30,
    rank: 'elite',
    explode: { radius: 145, damage: 50 },
  },
  brute: {
    label: 'Zerstörer',
    health: 1900,
    speed: 54,
    damage: 44,
    radius: 40,
    reward: 260,
    rank: 'mini',
    charge: { speed: 245, every: 6.5, duration: 1.5 },
    slam: { radius: 165, damage: 26, every: 9 },
  },
  boss: {
    label: 'Fleischkönig',
    health: 7200,
    speed: 46,
    damage: 68,
    radius: 58,
    reward: 900,
    rank: 'boss',
    charge: { speed: 190, every: 9, duration: 2 },
    slam: { radius: 240, damage: 42, every: 7 },
    summon: { count: 4, every: 11, type: 'normal' },
  },
};

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
  'rocket',
  'tesla',
  'laser',
];

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
};

export const BARRICADE_ORDER: DefenseType[] = ['wood', 'spike', 'stone', 'steel'];
export const TURRET_ORDER: DefenseType[] = ['mg', 'marksman', 'launcher'];

export type WaveKind = 'normal' | 'mini' | 'boss';

export interface WaveDefinition {
  kind: WaveKind;
  label: string;
  zombies: ZombieType[];
}

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
  theme: MapTheme;
  waves: WaveDefinition[];
  obstacles: MapObstacle[];
  decor: MapDecor[];
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const random = seeded(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function pack(counts: Partial<Record<ZombieType, number>>): ZombieType[] {
  const list: ZombieType[] = [];
  for (const [type, amount] of Object.entries(counts)) {
    for (let index = 0; index < (amount ?? 0); index += 1) list.push(type as ZombieType);
  }
  return list;
}

let waveSeed = 1337;

function wave(counts: Partial<Record<ZombieType, number>>): WaveDefinition {
  waveSeed += 17;
  return { kind: 'normal', label: 'Welle', zombies: shuffled(pack(counts), waveSeed) };
}

function miniWave(counts: Partial<Record<ZombieType, number>>, bosses = 1): WaveDefinition {
  waveSeed += 17;
  const escort = shuffled(pack(counts), waveSeed);
  return {
    kind: 'mini',
    label: 'Mini-Boss',
    zombies: [...Array<ZombieType>(bosses).fill('brute'), ...escort],
  };
}

function bossWave(counts: Partial<Record<ZombieType, number>>): WaveDefinition {
  waveSeed += 17;
  return {
    kind: 'boss',
    label: 'ENDBOSS',
    zombies: ['boss', ...shuffled(pack(counts), waveSeed)],
  };
}

const CENTER_X = ARENA.width / 2;
const CENTER_Y = ARENA.height / 2;

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
  const placed = [...base];
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

export const MAPS: GameMap[] = [
  {
    id: 'outpost',
    name: 'Vorposten 07',
    subtitle: 'Äußere Verteidigungszone',
    description:
      'Ruhiger Einstieg mit offenen Sichtlinien. Zehn Wellen, ein Mini-Boss und der erste Endboss.',
    difficulty: 1,
    moneyScale: 1,
    reward: 150,
    theme: {
      ground: '#101c16',
      groundAlt: '#152419',
      grid: '#1d2f26',
      accent: '#69f0ae',
      edge: '#284238',
      fog: '#05100c',
    },
    waves: [
      wave({ normal: 14 }),
      wave({ normal: 18, fast: 4 }),
      wave({ normal: 20, fast: 8, exploder: 2 }),
      wave({ normal: 22, fast: 10, big: 1, exploder: 3 }),
      miniWave({ normal: 16, fast: 8 }),
      wave({ normal: 26, fast: 12, big: 2, exploder: 4 }),
      wave({ normal: 30, fast: 16, big: 3, exploder: 5 }),
      wave({ normal: 32, fast: 20, big: 4, exploder: 7 }),
      miniWave({ normal: 26, fast: 16, big: 3, exploder: 6 }, 2),
      bossWave({ normal: 28, fast: 16, big: 4, exploder: 8 }),
    ],
    obstacles: scatter(OUTPOST_STRUCTURES, ['crate', 'barrel', 'tree', 'rock'], 16, 4711),
    decor: decorate(9021, ['grass', 'crack', 'puddle', 'marking', 'rubble'], 90),
  },
  {
    id: 'harbor',
    name: 'Industriehafen',
    subtitle: 'Containerterminal bei Nacht',
    description:
      'Enge Gassen zwischen Containern. Zwölf Wellen, zwei Mini-Boss-Wellen und ein deutlich zäherer Endboss.',
    difficulty: 1.45,
    moneyScale: 1.25,
    reward: 320,
    theme: {
      ground: '#0f1720',
      groundAlt: '#141f2a',
      grid: '#1c2a36',
      accent: '#57b8ff',
      edge: '#2a3f52',
      fog: '#060d14',
    },
    waves: [
      wave({ normal: 18, fast: 4 }),
      wave({ normal: 22, fast: 10, exploder: 3 }),
      wave({ normal: 26, fast: 12, big: 2, exploder: 4 }),
      miniWave({ normal: 20, fast: 12, exploder: 4 }),
      wave({ normal: 30, fast: 16, big: 3, exploder: 6 }),
      wave({ normal: 34, fast: 20, big: 4, exploder: 7 }),
      wave({ normal: 36, fast: 24, big: 5, exploder: 8 }),
      miniWave({ normal: 28, fast: 18, big: 4, exploder: 7 }, 2),
      wave({ normal: 40, fast: 26, big: 6, exploder: 10 }),
      wave({ normal: 44, fast: 30, big: 7, exploder: 11 }),
      miniWave({ normal: 34, fast: 22, big: 6, exploder: 10 }, 3),
      bossWave({ normal: 36, fast: 24, big: 6, exploder: 12 }),
    ],
    obstacles: scatter(HARBOR_STRUCTURES, ['crate', 'barrel', 'pipe', 'car'], 18, 22315),
    decor: decorate(5512, ['puddle', 'crack', 'rubble', 'marking', 'blood'], 110),
  },
  {
    id: 'base',
    name: 'Militärbasis Nord',
    subtitle: 'Gefallene Garnison',
    description:
      'Befestigte Stellungen mit langen Feuergassen. Vierzehn Wellen, drei Mini-Boss-Wellen und ein gepanzerter Endboss.',
    difficulty: 2,
    moneyScale: 1.5,
    reward: 600,
    theme: {
      ground: '#1a170f',
      groundAlt: '#221d13',
      grid: '#2c2618',
      accent: '#ffcc66',
      edge: '#4a3d22',
      fog: '#100c06',
    },
    waves: [
      wave({ normal: 24, fast: 8, exploder: 3 }),
      wave({ normal: 28, fast: 14, big: 2, exploder: 5 }),
      wave({ normal: 32, fast: 18, big: 3, exploder: 6 }),
      miniWave({ normal: 26, fast: 14, big: 2, exploder: 5 }, 2),
      wave({ normal: 36, fast: 22, big: 4, exploder: 8 }),
      wave({ normal: 40, fast: 26, big: 5, exploder: 9 }),
      wave({ normal: 44, fast: 30, big: 6, exploder: 10 }),
      miniWave({ normal: 34, fast: 22, big: 5, exploder: 9 }, 3),
      wave({ normal: 48, fast: 34, big: 7, exploder: 12 }),
      wave({ normal: 52, fast: 36, big: 8, exploder: 13 }),
      wave({ normal: 56, fast: 40, big: 9, exploder: 14 }),
      miniWave({ normal: 40, fast: 28, big: 7, exploder: 12 }, 4),
      wave({ normal: 60, fast: 44, big: 10, exploder: 16 }),
      bossWave({ normal: 48, fast: 34, big: 9, exploder: 16 }),
    ],
    obstacles: scatter(BASE_STRUCTURES, ['crate', 'barrel', 'sandbag', 'rock'], 20, 78311),
    decor: decorate(3391, ['crack', 'rubble', 'marking', 'bones', 'blood'], 120),
  },
  {
    id: 'crater',
    name: 'Krater-Quarantäne',
    subtitle: 'Ground Zero',
    description:
      'Der härteste Sektor. Sechzehn Wellen, vier Mini-Boss-Wellen und ein Endboss, der ganze Trupps auslöscht.',
    difficulty: 2.8,
    moneyScale: 1.8,
    reward: 1000,
    theme: {
      ground: '#1b1116',
      groundAlt: '#24161c',
      grid: '#33202a',
      accent: '#ff6577',
      edge: '#54293a',
      fog: '#12070c',
    },
    waves: [
      wave({ normal: 30, fast: 14, big: 2, exploder: 5 }),
      wave({ normal: 34, fast: 20, big: 3, exploder: 7 }),
      wave({ normal: 38, fast: 24, big: 5, exploder: 9 }),
      miniWave({ normal: 30, fast: 18, big: 4, exploder: 7 }, 2),
      wave({ normal: 44, fast: 28, big: 6, exploder: 11 }),
      wave({ normal: 48, fast: 32, big: 7, exploder: 12 }),
      wave({ normal: 52, fast: 36, big: 8, exploder: 13 }),
      miniWave({ normal: 40, fast: 26, big: 6, exploder: 11 }, 3),
      wave({ normal: 56, fast: 40, big: 9, exploder: 15 }),
      wave({ normal: 60, fast: 44, big: 10, exploder: 16 }),
      wave({ normal: 64, fast: 48, big: 11, exploder: 17 }),
      miniWave({ normal: 48, fast: 34, big: 9, exploder: 14 }, 4),
      wave({ normal: 68, fast: 52, big: 12, exploder: 18 }),
      wave({ normal: 72, fast: 56, big: 13, exploder: 20 }),
      miniWave({ normal: 54, fast: 40, big: 11, exploder: 16 }, 5),
      bossWave({ normal: 60, fast: 44, big: 12, exploder: 20 }),
    ],
    obstacles: scatter(CRATER_STRUCTURES, ['rock', 'barrel', 'crate', 'ruin'], 22, 60127),
    decor: decorate(7714, ['crack', 'blood', 'bones', 'rubble', 'puddle'], 130),
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

export function weaponLife(weapon: WeaponConfig) {
  return weapon.range / weapon.speed;
}

/** Wave plan of the first map, kept for quick reference and tests. */
export const WAVES: ReadonlyArray<WaveDefinition> = MAPS[0].waves;
