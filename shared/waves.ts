import type { WaveKind } from './snapshots.js';
import type { ZombieType } from './zombies.js';

export interface WaveDefinition {
  kind: WaveKind;
  label: string;
  zombies: ZombieType[];
}

export interface RosterEntry {
  type: ZombieType;
  /** First wave this enemy shows up in. */
  from: number;
  /** Relative weight inside the horde. */
  share: number;
}

export interface WavePlan {
  waves: number;
  boss: ZombieType;
  /** Horde size of the first wave and how much every wave adds. */
  base: number;
  step: number;
  /** Mini bosses this map can send, used round robin. */
  minis: ZombieType[];
  miniWaves: number[];
  swarmWaves: number[];
  roster: RosterEntry[];
  seed: number;
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

export function pack(counts: Partial<Record<ZombieType, number>>): ZombieType[] {
  const list: ZombieType[] = [];
  for (const [type, amount] of Object.entries(counts)) {
    for (let index = 0; index < (amount ?? 0); index += 1) list.push(type as ZombieType);
  }
  return list;
}

/**
 * Mixes a horde of roughly `size` bodies from everything the map has unlocked
 * by this wave, keeping the declared shares between the types.
 */
function horde(size: number, roster: RosterEntry[], wave: number) {
  const active = roster.filter((entry) => wave >= entry.from);
  const total = active.reduce((sum, entry) => sum + entry.share, 0) || 1;
  const counts: Partial<Record<ZombieType, number>> = {};
  for (const entry of active) {
    const amount = Math.max(1, Math.round((size * entry.share) / total));
    counts[entry.type] = (counts[entry.type] ?? 0) + amount;
  }
  return counts;
}

function merge(...groups: Array<Partial<Record<ZombieType, number>>>) {
  const total: Partial<Record<ZombieType, number>> = {};
  for (const group of groups) {
    for (const [type, amount] of Object.entries(group)) {
      total[type as ZombieType] = (total[type as ZombieType] ?? 0) + (amount ?? 0);
    }
  }
  return total;
}

/** A swarm wave trades tough bodies for a wall of cheap ones. */
function swarm(size: number, roster: RosterEntry[], wave: number) {
  const cheap = roster.filter((entry) => entry.type === 'crawler' || entry.type === 'fast');
  const rest = roster.filter((entry) => !cheap.includes(entry));
  if (cheap.length === 0) return horde(size * 1.8, roster, wave);
  return merge(horde(size * 1.5, cheap, wave), horde(size * 0.55, rest, wave));
}

function miniCount(plan: WavePlan, wave: number) {
  return Math.min(5, 1 + Math.floor((wave / plan.waves) * 4));
}

function minisFor(plan: WavePlan, wave: number, index: number): ZombieType[] {
  const amount = miniCount(plan, wave);
  const list: ZombieType[] = [];
  for (let slot = 0; slot < amount; slot += 1) {
    list.push(plan.minis[(index + slot) % plan.minis.length]);
  }
  return list;
}

// ------------------------------------------------------------------- endless

/** The mix the endless mode sends once a map has run out of planned waves. */
const ENDLESS_ROSTER: RosterEntry[] = [
  { type: 'normal', from: 1, share: 3 },
  { type: 'fast', from: 1, share: 3 },
  { type: 'crawler', from: 1, share: 3.4 },
  { type: 'exploder', from: 1, share: 1.6 },
  { type: 'big', from: 1, share: 1.4 },
  { type: 'armored', from: 1, share: 1.6 },
  { type: 'spitter', from: 1, share: 1.2 },
  { type: 'screamer', from: 1, share: 1 },
];

const ENDLESS_MINIS: ZombieType[] = ['brute', 'warden', 'stalker', 'mortar'];
/** Bodies of the first generated wave and what each further one adds. */
const ENDLESS_BASE = 26;
const ENDLESS_STEP = 4;
/**
 * Ceiling on the horde size. Past it the pressure comes from enemies that scale
 * with the wave number, not from ever longer mop-up work.
 */
const ENDLESS_CAP = 130;

/**
 * A wave the endless mode makes up on the spot: mini bosses every third wave, a
 * swarm every fifth and the boss of the map every tenth. Everything is seeded
 * from the wave number, so the same wave always looks the same.
 */
export function endlessWave(boss: ZombieType, wave: number): WaveDefinition {
  const size = Math.min(ENDLESS_CAP, ENDLESS_BASE + (wave - 1) * ENDLESS_STEP);
  const seed = 8801 + wave * 17;

  if (wave % 10 === 0) {
    const escort = Math.min(size * 0.8, 110);
    return {
      kind: 'boss',
      label: 'BOSS',
      zombies: [boss, ...shuffled(pack(horde(escort, ENDLESS_ROSTER, wave)), seed)],
    };
  }
  if (wave % 5 === 0) {
    return {
      kind: 'swarm',
      label: 'SCHWARM',
      zombies: shuffled(pack(swarm(size, ENDLESS_ROSTER, wave)), seed),
    };
  }
  if (wave % 3 === 0) {
    const leaders = Array.from(
      { length: Math.min(5, 1 + Math.floor(wave / 12)) },
      (_, slot) => ENDLESS_MINIS[(wave + slot) % ENDLESS_MINIS.length],
    );
    return {
      kind: 'mini',
      label: 'Mini-Boss',
      zombies: [...leaders, ...shuffled(pack(horde(size * 0.7, ENDLESS_ROSTER, wave)), seed)],
    };
  }
  return {
    kind: 'normal',
    label: 'Welle',
    zombies: shuffled(pack(horde(size, ENDLESS_ROSTER, wave)), seed),
  };
}

export function buildWaves(plan: WavePlan): WaveDefinition[] {
  const waves: WaveDefinition[] = [];
  let miniIndex = 0;

  for (let wave = 1; wave <= plan.waves; wave += 1) {
    const size = plan.base + (wave - 1) * plan.step;
    const seed = plan.seed + wave * 17;

    if (wave === plan.waves) {
      // The finale is about the boss, not about a long clean-up afterwards, so
      // its escort is capped.
      const escort = Math.min(size * 0.8, 110);
      waves.push({
        kind: 'boss',
        label: 'ENDBOSS',
        zombies: [plan.boss, ...shuffled(pack(horde(escort, plan.roster, wave)), seed)],
      });
      continue;
    }
    if (plan.miniWaves.includes(wave)) {
      const leaders = minisFor(plan, wave, miniIndex);
      miniIndex += 1;
      waves.push({
        kind: 'mini',
        label: 'Mini-Boss',
        zombies: [...leaders, ...shuffled(pack(horde(size * 0.65, plan.roster, wave)), seed)],
      });
      continue;
    }
    if (plan.swarmWaves.includes(wave)) {
      waves.push({
        kind: 'swarm',
        label: 'SCHWARM',
        zombies: shuffled(pack(swarm(size, plan.roster, wave)), seed),
      });
      continue;
    }
    waves.push({
      kind: 'normal',
      label: 'Welle',
      zombies: shuffled(pack(horde(size, plan.roster, wave)), seed),
    });
  }

  return waves;
}
