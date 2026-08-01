import type { PermanentPerks, PermanentUpgrades } from './upgrades.js';
import type { ZombieRank } from './zombies.js';

/** The one active tool a survivor may fire with G. */
export type PlayerAbilityType = 'grenade' | 'mortarStrike' | 'precisionShot' | 'nullCore';

export interface PlayerAbilityConfig {
  label: string;
  short: string;
  description: string;
  charges: number;
  cooldown: number;
  minCooldown: number;
}

export const GRENADE_BASE_DAMAGE = 120;
export const GRENADE_BASE_RADIUS = 110;
export const GRENADE_BASE_COOLDOWN = 18;
export const GRENADE_MIN_COOLDOWN = 6;

/** Heavy delayed area hit: deliberately one shell, never a fragment cloud. */
export const MORTAR_BASE_DAMAGE = 560;
export const MORTAR_BASE_RADIUS = 205;
export const MORTAR_BASE_COOLDOWN = 28;
export const MORTAR_MIN_COOLDOWN = 10;
export const MORTAR_FUSE = 1.45;
export const MORTAR_SLOW = 0.45;
export const MORTAR_BASE_SLOW_SECONDS = 0.5;
/** The one-time Phosphorkern perk turns the impact area into burning ground. */
export const MORTAR_NAPALM_DPS = 90;
export const MORTAR_NAPALM_SECONDS = 6;
export const MORTAR_NAPALM_RADIUS_SHARE = 0.72;

/** Visible, non-piercing single-target shot with a very long reload. */
export const PRECISION_BASE_DAMAGE = 1850;
export const PRECISION_BASE_COOLDOWN = 34;
export const PRECISION_MIN_COOLDOWN = 12;
export const PRECISION_PROJECTILE_SPEED = 2100;
export const PRECISION_PROJECTILE_RADIUS = 9;
export const PRECISION_PROJECTILE_LIFE = 1.35;
/** Each level adds max-health damage; sturdy leaders resist most of that scaling. */
export const PRECISION_HEALTH_DAMAGE_PER_LEVEL = 0.01;
export const PRECISION_MINI_HEALTH_DAMAGE_FACTOR = 0.4;
export const PRECISION_BOSS_HEALTH_DAMAGE_FACTOR = 0.15;
/** Todesurteil removes most of a running reload, but never grants a free shot. */
export const PRECISION_KILL_COOLDOWN_REDUCTION = 0.7;

/** A stationary projectile with a lethal core and a wider damaging field. */
export const NULL_CORE_BASE_DPS = 720;
export const NULL_CORE_BASE_RADIUS = 58;
export const NULL_FIELD_BASE_DPS = 180;
export const NULL_FIELD_BASE_RADIUS = 155;
export const NULL_CORE_BASE_SECONDS = 5;
export const NULL_CORE_SECONDS_PER_LEVEL = 0.1;
export const NULL_CORE_BASE_COOLDOWN = 40;
export const NULL_CORE_MIN_COOLDOWN = 14;
/** The Gravitationsanker perk drags targets into the lethal core. */
export const NULL_CORE_PULL_SPEED = 80;
export const NULL_CORE_SLOW = 0.4;

export function precisionHealthDamageFraction(level: number, rank: ZombieRank) {
  const rankFactor =
    rank === 'boss'
      ? PRECISION_BOSS_HEALTH_DAMAGE_FACTOR
      : rank === 'mini'
        ? PRECISION_MINI_HEALTH_DAMAGE_FACTOR
        : 1;
  return Math.max(0, Math.floor(level)) * PRECISION_HEALTH_DAMAGE_PER_LEVEL * rankFactor;
}

export const PLAYER_ABILITIES: Record<PlayerAbilityType, PlayerAbilityConfig> = {
  grenade: {
    label: 'Granate',
    short: '●',
    description: 'Sofortige Explosion; kann durch Splittergranaten große Gruppen abräumen.',
    charges: 3,
    cooldown: GRENADE_BASE_COOLDOWN,
    minCooldown: GRENADE_MIN_COOLDOWN,
  },
  mortarStrike: {
    label: 'Mörserschlag',
    short: '⌖',
    description: 'Markiert eine große Fläche und schlägt nach kurzer Warnzeit mit Wucht ein.',
    charges: 1,
    cooldown: MORTAR_BASE_COOLDOWN,
    minCooldown: MORTAR_MIN_COOLDOWN,
  },
  precisionShot: {
    label: 'Vernichtungsschuss',
    short: '➤',
    description: 'Ein sichtbares Hochkaliber-Geschoss mit enormem Einzelschaden ohne Durchschlag.',
    charges: 1,
    cooldown: PRECISION_BASE_COOLDOWN,
    minCooldown: PRECISION_MIN_COOLDOWN,
  },
  nullCore: {
    label: 'Nullpunktkern',
    short: '✦',
    description:
      'Setzt für einige Sekunden ein stehendes Projektil mit massivem Kernschaden und äußerem Schadensfeld.',
    charges: 1,
    cooldown: NULL_CORE_BASE_COOLDOWN,
    minCooldown: NULL_CORE_MIN_COOLDOWN,
  },
};

export const PLAYER_ABILITY_ORDER: PlayerAbilityType[] = [
  'grenade',
  'mortarStrike',
  'precisionShot',
  'nullCore',
];

/** Grenades are the starter ability; advanced abilities must be unlocked once. */
export const PLAYER_ABILITY_COST: Record<PlayerAbilityType, number> = {
  grenade: 0,
  mortarStrike: 1800,
  precisionShot: 1800,
  nullCore: 2800,
};

export function isPlayerAbility(value: unknown): value is PlayerAbilityType {
  return typeof value === 'string' && value in PLAYER_ABILITIES;
}

export function abilityMaxCharges(type: PlayerAbilityType, perks: PermanentPerks) {
  const extra =
    type === 'grenade'
      ? perks.extraGrenade
      : type === 'mortarStrike'
        ? perks.extraMortar
        : type === 'precisionShot'
          ? perks.extraPrecision
          : perks.extraNullCore;
  return PLAYER_ABILITIES[type].charges + (extra ? 1 : 0);
}

export function abilityRechargeTime(type: PlayerAbilityType, upgrades: PermanentUpgrades) {
  const config = PLAYER_ABILITIES[type];
  const level =
    type === 'grenade'
      ? upgrades.grenadeCooldown
      : type === 'mortarStrike'
        ? upgrades.mortarCooldown
        : type === 'precisionShot'
          ? upgrades.precisionCooldown
          : upgrades.nullCoreCooldown;
  return Math.max(config.minCooldown, config.cooldown / (1 + level * 0.02));
}
