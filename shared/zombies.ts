export type ZombieType =
  // trash
  | 'normal'
  | 'fast'
  | 'crawler'
  // elite
  | 'big'
  | 'exploder'
  | 'armored'
  | 'shieldbearer'
  | 'phaseguard'
  | 'evasive'
  | 'phantom'
  | 'jammer'
  | 'blink'
  | 'spitter'
  | 'screamer'
  // mini bosses
  | 'brute'
  | 'warden'
  | 'stalker'
  | 'mortar'
  | 'broodling'
  // one boss per map
  | 'butcher'
  | 'brood'
  | 'warlord'
  | 'artillery'
  | 'vortex'
  | 'slag'
  | 'render'
  | 'swarmqueen'
  | 'plague'
  | 'omega'
  | 'bastion'
  | 'siren'
  | 'tunneler'
  | 'roadking'
  | 'eclipse'
  | 'bulwark'
  | 'nightlord'
  | 'signalbreaker'
  | 'worldeater';

export type ZombieRank = 'trash' | 'elite' | 'mini' | 'boss';

/** How often a summoner may call in its full pack before it runs dry. */
export const SUMMON_CYCLES = 5;

/**
 * Global balance pass on everything the horde deals out: contact damage, boss
 * slams and mortars, ground hazards and exploders all land a tenth softer than
 * the numbers in this file suggest.
 */
export const ZOMBIE_DAMAGE_SCALE = 0.9;

/**
 * Ground effects. `lava` and `poison` belong to the enemy and eat the squad,
 * `acid` and `napalm` belong to the squad and only hurt zombies.
 */
export type HazardKind =
  'warning' | 'lava' | 'poison' | 'pull' | 'acid' | 'napalm' | 'nullField' | 'nullCore';

/**
 * Everything a boss can do, as plain data. Each entry gets its own timer, so a
 * boss is just a list of abilities instead of a pile of special cases.
 */
export type ZombieAbility =
  /** Sprints at the squad for a moment. */
  | { kind: 'charge'; every: number; speed: number; duration: number }
  /** Area hit around the boss, optionally announced by a red ring first. */
  | { kind: 'slam'; every: number; radius: number; damage: number; telegraph?: number }
  /**
   * Calls in more zombies. Every summoner has a lifetime budget of
   * `count * SUMMON_CYCLES`, so no wave can ever be kept alive forever by an
   * enemy that spawns faster than a squad can clear.
   */
  | { kind: 'summon'; every: number; count: number; type: ZombieType }
  /** Breaks apart into smaller enemies when it dies. */
  | { kind: 'split'; count: number; type: ZombieType }
  /**
   * Mends every zombie nearby by `amount` of their maximum health. A boss that
   * also patches itself uses the much smaller `selfAmount`, otherwise its own
   * huge health pool would outheal any squad.
   */
  | {
      kind: 'heal';
      every: number;
      radius: number;
      amount: number;
      self: boolean;
      selfAmount?: number;
    }
  /** Lobs telegraphed bombs at the squad from a distance. */
  | {
      kind: 'mortar';
      every: number;
      shots: number;
      radius: number;
      damage: number;
      telegraph: number;
      range: number;
    }
  /** Drags players in or shoves them away. */
  | {
      kind: 'vortex';
      every: number;
      radius: number;
      force: number;
      duration: number;
      push: boolean;
    }
  /** Leaves burning or toxic ground behind. */
  | {
      kind: 'puddle';
      every: number;
      hazard: 'lava' | 'poison';
      radius: number;
      dps: number;
      life: number;
      count: number;
      spread: number;
    }
  /** Passive aura that speeds up nearby zombies. */
  | { kind: 'haste'; radius: number; factor: number }
  /** Briefly blocks projectiles from every direction. */
  | { kind: 'phaseShield'; every: number; duration: number };

export interface ZombieConfig {
  label: string;
  health: number;
  speed: number;
  damage: number;
  radius: number;
  reward: number;
  rank: ZombieRank;
  /** Fraction of incoming damage that bounces off, 0 for soft flesh. */
  armor?: number;
  /**
   * Projectiles inside this forward arc vanish on contact. The turn rate keeps
   * the protected side readable and leaves a real flanking window.
   */
  frontShield?: { arc: number; turnSpeed: number };
  /** Sways across its route so slow projectiles have to predict the next hook. */
  zigzag?: { angle: number; frequency: number };
  /** Automated defenses cannot acquire this target; direct and area damage still work. */
  hiddenFromTurrets?: boolean;
  /** Nearby automated defenses recharge this slowly while the disruptor lives. */
  turretSlow?: { radius: number; factor: number };
  /** Once ready, the next damaging hit makes this enemy leap sideways. */
  hitDodge?: { cooldown: number; distance: number };
  explode?: { radius: number; damage: number };
  abilities?: ZombieAbility[];
  /** Short line shown on the map card and the boss bar. */
  threat?: string;
}

export const ZOMBIES: Record<ZombieType, ZombieConfig> = {
  // ------------------------------------------------------------------ trash
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
  crawler: {
    label: 'Kriecher',
    health: 26,
    speed: 172,
    damage: 7,
    radius: 11,
    reward: 11,
    rank: 'trash',
  },

  // ------------------------------------------------------------------ elite
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
  armored: {
    label: 'Panzerträger',
    health: 520,
    speed: 52,
    damage: 26,
    radius: 26,
    reward: 62,
    rank: 'elite',
    armor: 0.35,
  },
  shieldbearer: {
    label: 'Schildträger',
    health: 440,
    speed: 48,
    damage: 24,
    radius: 27,
    reward: 72,
    rank: 'elite',
    frontShield: { arc: Math.PI * 0.82, turnSpeed: 0.72 },
  },
  phaseguard: {
    label: 'Phasenwächter',
    health: 330,
    speed: 64,
    damage: 21,
    radius: 24,
    reward: 68,
    rank: 'elite',
    abilities: [{ kind: 'phaseShield', every: 7.2, duration: 1.35 }],
  },
  evasive: {
    label: 'Hakenläufer',
    health: 125,
    speed: 124,
    damage: 13,
    radius: 16,
    reward: 38,
    rank: 'elite',
    zigzag: { angle: 0.72, frequency: 5.4 },
  },
  phantom: {
    label: 'Phantom',
    health: 145,
    speed: 82,
    damage: 17,
    radius: 18,
    reward: 46,
    rank: 'elite',
    hiddenFromTurrets: true,
  },
  jammer: {
    label: 'Störseucher',
    health: 285,
    speed: 66,
    damage: 18,
    radius: 22,
    reward: 66,
    rank: 'elite',
    turretSlow: { radius: 285, factor: 0.55 },
    threat: 'verlangsamt Geschütztürme in seiner Nähe',
  },
  blink: {
    label: 'Sprunghetzer',
    health: 175,
    speed: 112,
    damage: 16,
    radius: 17,
    reward: 54,
    rank: 'elite',
    hitDodge: { cooldown: 1, distance: 135 },
    threat: 'weicht dem nächsten Treffer jede Sekunde mit einem Dash aus',
  },
  spitter: {
    label: 'Speier',
    health: 150,
    speed: 62,
    damage: 10,
    radius: 19,
    reward: 44,
    rank: 'elite',
    abilities: [
      {
        kind: 'puddle',
        every: 5.5,
        hazard: 'poison',
        radius: 74,
        dps: 16,
        life: 6,
        count: 1,
        spread: 260,
      },
    ],
  },
  screamer: {
    label: 'Kreischer',
    health: 210,
    speed: 88,
    damage: 14,
    radius: 20,
    reward: 52,
    rank: 'elite',
    abilities: [{ kind: 'haste', radius: 260, factor: 1.35 }],
  },

  // ------------------------------------------------------------- mini bosses
  brute: {
    label: 'Zerstörer',
    health: 1900,
    speed: 54,
    damage: 44,
    radius: 40,
    reward: 260,
    rank: 'mini',
    abilities: [
      { kind: 'charge', every: 6.5, speed: 245, duration: 1.5 },
      { kind: 'slam', every: 9, radius: 165, damage: 26 },
    ],
  },
  warden: {
    label: 'Wächter',
    health: 2600,
    speed: 44,
    damage: 40,
    radius: 42,
    reward: 330,
    rank: 'mini',
    armor: 0.3,
    abilities: [
      { kind: 'summon', every: 11, count: 2, type: 'armored' },
      { kind: 'slam', every: 11, radius: 190, damage: 30, telegraph: 1 },
    ],
  },
  stalker: {
    label: 'Schlitzer',
    health: 1500,
    speed: 100,
    damage: 38,
    radius: 32,
    reward: 290,
    rank: 'mini',
    abilities: [{ kind: 'charge', every: 4, speed: 360, duration: 1.1 }],
  },
  mortar: {
    label: 'Mörserträger',
    health: 1700,
    speed: 40,
    damage: 26,
    radius: 38,
    reward: 310,
    rank: 'mini',
    abilities: [
      {
        kind: 'mortar',
        every: 6.5,
        shots: 3,
        radius: 105,
        damage: 46,
        telegraph: 1.2,
        range: 900,
      },
    ],
  },
  broodling: {
    label: 'Brutling',
    health: 900,
    speed: 84,
    damage: 30,
    radius: 28,
    reward: 150,
    rank: 'mini',
    abilities: [
      { kind: 'charge', every: 5, speed: 260, duration: 1 },
      { kind: 'split', count: 4, type: 'crawler' },
    ],
  },

  // ------------------------------------------------------------------ bosses
  butcher: {
    label: 'Fleischkönig',
    health: 7560,
    speed: 46,
    damage: 68,
    radius: 58,
    reward: 900,
    rank: 'boss',
    threat: 'Sturmangriff und Schockwelle',
    abilities: [
      { kind: 'charge', every: 9, speed: 190, duration: 2 },
      { kind: 'slam', every: 7, radius: 240, damage: 42 },
      { kind: 'summon', every: 11, count: 4, type: 'normal' },
    ],
  },
  brood: {
    label: 'Brutmutter',
    health: 7770,
    speed: 50,
    damage: 60,
    radius: 56,
    reward: 1100,
    rank: 'boss',
    threat: 'teilt sich beim Sterben',
    abilities: [
      { kind: 'summon', every: 7, count: 6, type: 'crawler' },
      { kind: 'slam', every: 10, radius: 210, damage: 38 },
      { kind: 'split', count: 2, type: 'broodling' },
    ],
  },
  warlord: {
    label: 'Feldmarschall',
    health: 7980,
    speed: 44,
    damage: 66,
    radius: 58,
    reward: 1300,
    rank: 'boss',
    threat: 'heilt sich und die Horde',
    armor: 0.2,
    abilities: [
      { kind: 'heal', every: 6, radius: 420, amount: 0.05, self: true, selfAmount: 0.008 },
      { kind: 'summon', every: 9, count: 3, type: 'armored' },
      { kind: 'charge', every: 11, speed: 200, duration: 1.8 },
    ],
  },
  artillery: {
    label: 'Artillerist',
    health: 8190,
    speed: 40,
    damage: 58,
    radius: 56,
    reward: 1500,
    rank: 'boss',
    threat: 'Bombenhagel mit Warnkreisen',
    abilities: [
      {
        kind: 'mortar',
        every: 5,
        shots: 5,
        radius: 125,
        damage: 62,
        telegraph: 1.3,
        range: 1300,
      },
      { kind: 'slam', every: 12, radius: 220, damage: 40, telegraph: 0.9 },
      { kind: 'summon', every: 13, count: 5, type: 'exploder' },
    ],
  },
  vortex: {
    label: 'Sogfürst',
    health: 8400,
    speed: 46,
    damage: 62,
    radius: 58,
    reward: 1700,
    rank: 'boss',
    threat: 'saugt an und stößt ab',
    abilities: [
      { kind: 'vortex', every: 8, radius: 760, force: 260, duration: 1.6, push: false },
      { kind: 'vortex', every: 13, radius: 620, force: 620, duration: 0.5, push: true },
      { kind: 'slam', every: 10, radius: 260, damage: 48, telegraph: 1 },
      { kind: 'summon', every: 12, count: 5, type: 'fast' },
    ],
  },
  slag: {
    label: 'Schlackenherr',
    health: 8610,
    speed: 48,
    damage: 70,
    radius: 60,
    reward: 1900,
    rank: 'boss',
    threat: 'hinterlässt Lavapfützen',
    abilities: [
      {
        kind: 'puddle',
        every: 4,
        hazard: 'lava',
        radius: 96,
        dps: 34,
        life: 9,
        count: 2,
        spread: 200,
      },
      { kind: 'charge', every: 8, speed: 230, duration: 1.7 },
      { kind: 'slam', every: 11, radius: 240, damage: 46 },
    ],
  },
  render: {
    label: 'Zerreißer',
    health: 9030,
    speed: 50,
    damage: 74,
    radius: 62,
    reward: 2200,
    rank: 'boss',
    threat: 'gewaltige Druckwelle',
    armor: 0.15,
    abilities: [
      { kind: 'slam', every: 8, radius: 430, damage: 96, telegraph: 1.5 },
      { kind: 'charge', every: 9, speed: 240, duration: 1.8 },
      { kind: 'summon', every: 12, count: 4, type: 'screamer' },
    ],
  },
  swarmqueen: {
    label: 'Schwarmkönigin',
    health: 9450,
    speed: 44,
    damage: 70,
    radius: 62,
    reward: 2600,
    rank: 'boss',
    threat: 'endloser Nachschub',
    abilities: [
      { kind: 'summon', every: 3.5, count: 8, type: 'crawler' },
      { kind: 'summon', every: 9, count: 3, type: 'spitter' },
      { kind: 'slam', every: 9, radius: 260, damage: 50, telegraph: 0.9 },
      { kind: 'split', count: 3, type: 'broodling' },
    ],
  },
  plague: {
    label: 'Seuchenfürst',
    health: 10080,
    speed: 46,
    damage: 72,
    radius: 62,
    reward: 3000,
    rank: 'boss',
    threat: 'Giftpfützen und Heilschwaden',
    armor: 0.2,
    abilities: [
      {
        kind: 'puddle',
        every: 3.6,
        hazard: 'poison',
        radius: 110,
        dps: 30,
        life: 11,
        count: 3,
        spread: 420,
      },
      { kind: 'heal', every: 5, radius: 520, amount: 0.07, self: true, selfAmount: 0.006 },
      { kind: 'summon', every: 8, count: 5, type: 'exploder' },
      { kind: 'charge', every: 12, speed: 210, duration: 1.6 },
    ],
  },
  omega: {
    label: 'OMEGA',
    health: 11025,
    speed: 50,
    damage: 84,
    radius: 76,
    reward: 4500,
    rank: 'boss',
    threat: 'alles auf einmal — nur keine Heilung',
    armor: 0.2,
    abilities: [
      { kind: 'slam', every: 9, radius: 470, damage: 110, telegraph: 1.4 },
      {
        kind: 'mortar',
        every: 6,
        shots: 6,
        radius: 130,
        damage: 74,
        telegraph: 1.2,
        range: 1600,
      },
      { kind: 'vortex', every: 11, radius: 900, force: 300, duration: 1.5, push: false },
      {
        kind: 'puddle',
        every: 5,
        hazard: 'lava',
        radius: 104,
        dps: 40,
        life: 10,
        count: 2,
        spread: 340,
      },
      { kind: 'charge', every: 10, speed: 250, duration: 1.9 },
      { kind: 'summon', every: 12, count: 2, type: 'armored' },
      { kind: 'split', count: 1, type: 'warden' },
    ],
  },
  bastion: {
    label: 'Bastionsbrecher',
    health: 11970,
    speed: 38,
    damage: 92,
    radius: 72,
    reward: 5200,
    rank: 'boss',
    threat: 'extreme Frontpanzerung und Belagerungsschläge',
    armor: 0.48,
    abilities: [
      { kind: 'slam', every: 7.5, radius: 360, damage: 102, telegraph: 1.35 },
      {
        kind: 'mortar',
        every: 8,
        shots: 4,
        radius: 118,
        damage: 72,
        telegraph: 1.2,
        range: 1500,
      },
      { kind: 'summon', every: 12, count: 3, type: 'armored' },
    ],
  },
  siren: {
    label: 'Sirene Null',
    health: 12705,
    speed: 62,
    damage: 78,
    radius: 60,
    reward: 5900,
    rank: 'boss',
    threat: 'beschleunigt und heilt ihre Angriffswelle',
    abilities: [
      { kind: 'haste', radius: 620, factor: 1.55 },
      { kind: 'heal', every: 5.5, radius: 580, amount: 0.09, self: false },
      { kind: 'summon', every: 7, count: 4, type: 'screamer' },
      { kind: 'vortex', every: 10, radius: 720, force: 360, duration: 1.2, push: false },
    ],
  },
  tunneler: {
    label: 'Tiefenwurm',
    health: 13545,
    speed: 76,
    damage: 88,
    radius: 68,
    reward: 6800,
    rank: 'boss',
    threat: 'giftige Jagd, Sturmangriffe und Nachwuchs beim Tod',
    abilities: [
      { kind: 'charge', every: 5.8, speed: 330, duration: 1.45 },
      {
        kind: 'puddle',
        every: 4.5,
        hazard: 'poison',
        radius: 92,
        dps: 38,
        life: 9,
        count: 4,
        spread: 520,
      },
      { kind: 'slam', every: 9, radius: 275, damage: 78, telegraph: 0.9 },
      { kind: 'split', count: 3, type: 'stalker' },
    ],
  },
  roadking: {
    label: 'Straßenkönig',
    health: 14805,
    speed: 58,
    damage: 98,
    radius: 74,
    reward: 7900,
    rank: 'boss',
    threat: 'jagt den Konvoi mit Bomben und Sprenglingen',
    armor: 0.24,
    abilities: [
      {
        kind: 'mortar',
        every: 4.8,
        shots: 7,
        radius: 120,
        damage: 78,
        telegraph: 1.05,
        range: 1750,
      },
      { kind: 'charge', every: 7.5, speed: 300, duration: 1.8 },
      { kind: 'vortex', every: 11, radius: 680, force: 700, duration: 0.45, push: true },
      { kind: 'summon', every: 8.5, count: 5, type: 'exploder' },
    ],
  },
  eclipse: {
    label: 'EKLIPSE',
    health: 16590,
    speed: 58,
    damage: 108,
    radius: 82,
    reward: 9800,
    rank: 'boss',
    threat: 'wechselt zwischen Feuersturm, Giftnebel und Gravitation',
    armor: 0.28,
    abilities: [
      { kind: 'slam', every: 7.8, radius: 520, damage: 128, telegraph: 1.5 },
      {
        kind: 'mortar',
        every: 5.5,
        shots: 8,
        radius: 136,
        damage: 86,
        telegraph: 1.15,
        range: 1800,
      },
      { kind: 'vortex', every: 9, radius: 980, force: 360, duration: 1.55, push: false },
      { kind: 'vortex', every: 14, radius: 760, force: 760, duration: 0.5, push: true },
      {
        kind: 'puddle',
        every: 4.2,
        hazard: 'lava',
        radius: 108,
        dps: 44,
        life: 10,
        count: 2,
        spread: 420,
      },
      {
        kind: 'puddle',
        every: 6.8,
        hazard: 'poison',
        radius: 124,
        dps: 36,
        life: 12,
        count: 3,
        spread: 580,
      },
      { kind: 'summon', every: 10, count: 3, type: 'screamer' },
      { kind: 'split', count: 2, type: 'warden' },
    ],
  },
  bulwark: {
    label: 'AEGIS PRIME',
    health: 18900,
    speed: 42,
    damage: 116,
    radius: 86,
    reward: 12000,
    rank: 'boss',
    threat: 'riesiger Frontschild, Schildverstärkung und Belagerungsschläge',
    armor: 0.3,
    frontShield: { arc: Math.PI * 0.92, turnSpeed: 0.38 },
    abilities: [
      { kind: 'slam', every: 7.2, radius: 480, damage: 132, telegraph: 1.45 },
      { kind: 'charge', every: 9.5, speed: 230, duration: 1.8 },
      { kind: 'summon', every: 8, count: 5, type: 'shieldbearer' },
    ],
  },
  nightlord: {
    label: 'NACHTFÜRST',
    health: 21840,
    speed: 72,
    damage: 112,
    radius: 76,
    reward: 13800,
    rank: 'boss',
    hiddenFromTurrets: true,
    threat: 'bleibt für Türme unsichtbar und hetzt Phantome durch den Schleier',
    abilities: [
      { kind: 'phaseShield', every: 7.5, duration: 1.5 },
      { kind: 'charge', every: 6, speed: 350, duration: 1.4 },
      { kind: 'summon', every: 7, count: 6, type: 'phantom' },
      { kind: 'summon', every: 10, count: 3, type: 'blink' },
      { kind: 'vortex', every: 11, radius: 760, force: 330, duration: 1.2, push: false },
    ],
  },
  signalbreaker: {
    label: 'TRIARCH-BRECHER',
    health: 24780,
    speed: 46,
    damage: 128,
    radius: 88,
    reward: 16000,
    rank: 'boss',
    armor: 0.34,
    threat: 'belagert die Signalkerne mit Störfeldern und schweren Schlägen',
    abilities: [
      { kind: 'slam', every: 7, radius: 510, damage: 142, telegraph: 1.45 },
      {
        kind: 'mortar',
        every: 5.2,
        shots: 8,
        radius: 132,
        damage: 92,
        telegraph: 1.1,
        range: 1850,
      },
      { kind: 'summon', every: 8, count: 4, type: 'jammer' },
      { kind: 'summon', every: 10, count: 5, type: 'shieldbearer' },
      { kind: 'vortex', every: 13, radius: 820, force: 780, duration: 0.5, push: true },
    ],
  },
  worldeater: {
    label: 'WELTENFRESSER',
    health: 24000,
    speed: 34,
    damage: 168,
    radius: 132,
    reward: 30000,
    rank: 'boss',
    armor: 0.38,
    threat: 'riesiger Endgegner mit Druckwellen, Bombardement und Weltenriss',
    abilities: [
      { kind: 'slam', every: 7.8, radius: 660, damage: 188, telegraph: 1.8 },
      {
        kind: 'mortar',
        every: 6.2,
        shots: 10,
        radius: 150,
        damage: 112,
        telegraph: 1.25,
        range: 2100,
      },
      { kind: 'vortex', every: 10, radius: 1180, force: 430, duration: 1.7, push: false },
      { kind: 'vortex', every: 15, radius: 900, force: 900, duration: 0.55, push: true },
      {
        kind: 'puddle',
        every: 5.4,
        hazard: 'lava',
        radius: 132,
        dps: 56,
        life: 12,
        count: 4,
        spread: 680,
      },
      { kind: 'charge', every: 12, speed: 220, duration: 2.1 },
      { kind: 'phaseShield', every: 9.5, duration: 1.25 },
      { kind: 'summon', every: 11, count: 5, type: 'jammer' },
    ],
  },
};

export const ZOMBIE_TYPES = Object.keys(ZOMBIES) as ZombieType[];

export const MINI_BOSSES: ZombieType[] = ['brute', 'warden', 'stalker', 'mortar'];

export const BOSSES: ZombieType[] = [
  'butcher',
  'brood',
  'warlord',
  'artillery',
  'vortex',
  'slag',
  'render',
  'swarmqueen',
  'plague',
  'omega',
  'bastion',
  'siren',
  'tunneler',
  'roadking',
  'eclipse',
  'bulwark',
  'nightlord',
  'signalbreaker',
  'worldeater',
];

export type AbilityOf<K extends ZombieAbility['kind']> = Extract<ZombieAbility, { kind: K }>;
export type TimedAbility = Exclude<ZombieAbility, AbilityOf<'split'> | AbilityOf<'haste'>>;

export function zombieAbilities(type: ZombieType): ZombieAbility[] {
  return ZOMBIES[type].abilities ?? [];
}

/** Abilities that fire on a timer; `split` and `haste` work differently. */
export function timedAbilities(type: ZombieType): TimedAbility[] {
  return zombieAbilities(type).filter(
    (ability): ability is TimedAbility => ability.kind !== 'split' && ability.kind !== 'haste',
  );
}

export function splitAbility(type: ZombieType) {
  return zombieAbilities(type).find(
    (ability): ability is AbilityOf<'split'> => ability.kind === 'split',
  );
}

export function hasteAura(type: ZombieType) {
  return zombieAbilities(type).find(
    (ability): ability is AbilityOf<'haste'> => ability.kind === 'haste',
  );
}

/** Whether a turret, mortar or hangar drone may deliberately acquire this enemy. */
export function canTurretTarget(type: ZombieType) {
  return !ZOMBIES[type].hiddenFromTurrets;
}
