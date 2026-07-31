import type { PermanentPerks, PermanentUpgrades } from './upgrades.js';

/** The one active tool a survivor may fire with G. */
export type PlayerAbilityType = 'grenade' | 'mortarStrike' | 'precisionShot';

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
export const MORTAR_MIN_COOLDOWN = 12;
export const MORTAR_FUSE = 1.45;
export const MORTAR_SLOW = 0.45;
export const MORTAR_BASE_SLOW_SECONDS = 0.5;

/** Visible, non-piercing single-target shot with a very long reload. */
export const PRECISION_BASE_DAMAGE = 1850;
export const PRECISION_BASE_COOLDOWN = 34;
export const PRECISION_MIN_COOLDOWN = 14;
export const PRECISION_PROJECTILE_SPEED = 2100;
export const PRECISION_PROJECTILE_RADIUS = 9;
export const PRECISION_PROJECTILE_LIFE = 1.35;

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
};

export const PLAYER_ABILITY_ORDER: PlayerAbilityType[] = [
  'grenade',
  'mortarStrike',
  'precisionShot',
];

export function isPlayerAbility(value: unknown): value is PlayerAbilityType {
  return typeof value === 'string' && value in PLAYER_ABILITIES;
}

export function abilityMaxCharges(type: PlayerAbilityType, perks: PermanentPerks) {
  return PLAYER_ABILITIES[type].charges + (type === 'grenade' && perks.extraGrenade ? 1 : 0);
}

export function abilityRechargeTime(type: PlayerAbilityType, upgrades: PermanentUpgrades) {
  const config = PLAYER_ABILITIES[type];
  const level =
    type === 'grenade'
      ? upgrades.grenadeCooldown
      : type === 'mortarStrike'
        ? upgrades.mortarCooldown
        : upgrades.precisionCooldown;
  return Math.max(config.minCooldown, config.cooldown / (1 + level * 0.02));
}
