/**
 * Everything client and server agree on, split by topic. This file only
 * re-exports, so `shared/game-types` stays the single import for both sides.
 */
export * from './arena.js';
export * from './defenses.js';
export * from './maps.js';
export * from './snapshots.js';
export * from './upgrades.js';
export * from './waves.js';
export * from './weapons.js';
export * from './zombies.js';

import { MAPS } from './maps.js';
import type { WaveDefinition } from './waves.js';

/** Wave plan of the first map, kept for quick reference and tests. */
export const WAVES: ReadonlyArray<WaveDefinition> = MAPS[0].waves;
