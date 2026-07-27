/** Size of the world, the camera and everything the player physically is. */

export const ARENA = {
  width: 2400,
  height: 1600,
  padding: 52,
} as const;

export const VIEWPORT = {
  width: 1280,
  height: 720,
} as const;

/** How many zombies may walk the arena at once; the rest waits in the queue. */
export const MAX_ACTIVE_ZOMBIES = 95;

export const PLAYER_BASE_SPEED = 205;
export const PLAYER_RADIUS = 18;
export const REVIVE_RADIUS = 74;
export const REVIVE_SECONDS = 1.6;
export const START_MONEY = 400;

/** Dash charges everyone starts with, before permanent upgrades. */
export const DASH_BASE_CHARGES = 2;
/** How long one dash lasts — short enough to be a dodge, not a sprint. */
export const DASH_SECONDS = 0.22;
/** Speed multiplier while dashing. */
export const DASH_SPEED = 3.6;
/** Seconds one spent charge needs to come back. */
export const DASH_RECHARGE = 3.4;
/** Minimum gap between two dashes, so charges cannot be dumped at once. */
export const DASH_LOCK = 0.28;
/**
 * A dash is a dodge, not a free pass: this share of a blow bounces off on its
 * own, and only the levelled upgrade pushes it up to the full immunity.
 */
export const DASH_BASE_RESIST = 0.4;
/** How much more of a hit every level of the dash resistance swallows. */
export const DASH_RESIST_STEP = 0.1;
/** Initial reach, damage and shove of the shockwave the dash perk adds. */
export const DASH_SHOCK_RADIUS = 112;
export const DASH_SHOCK_DAMAGE = 65;
export const DASH_SHOCK_FORCE = 90;
/** Damage every enemy takes that the blade dash runs through. */
export const DASH_CUT_DAMAGE = 58;
/** Shield one of those hits hands out, before the levelled upgrade. */
export const DASH_SHIELD_PER_HIT = 10;
/** A shield never replaces health, so it stays a slice of the own maximum. */
export const SHIELD_SHARE = 0.35;
/** Shield points that fade away per second when nothing refreshes them. */
export const SHIELD_DECAY = 4;
