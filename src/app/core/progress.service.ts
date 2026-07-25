import { Injectable, computed, signal } from '@angular/core';
import {
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  MAPS,
  PERK_COST,
  upgradeLevelCost,
  upgradeMaxLevel,
  type PermanentPerks,
  type PermanentUpgrades,
  type PerkKey,
  type UpgradeKey,
} from '../../../shared/game-types';

export type { PerkKey, UpgradeKey };

export interface UpgradeDefinition {
  key: UpgradeKey;
  label: string;
  description: string;
  icon: string;
}

export interface PerkDefinition {
  key: PerkKey;
  label: string;
  description: string;
  icon: string;
}

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { key: 'maxHealth', label: 'Maximales Leben', description: '+2 % Leben', icon: '♥' },
  { key: 'armor', label: 'Panzerung', description: '−1 % Schaden (max. −35 %)', icon: '⛨' },
  { key: 'moveSpeed', label: 'Bewegung', description: '+2 % Tempo', icon: '➜' },
  { key: 'dashCharges', label: 'Zusätzlicher Dash', description: '+1 Dash-Ladung', icon: '»' },
  { key: 'dashRecharge', label: 'Dash-Aufladung', description: '+2 % schneller', icon: '◌' },
  { key: 'weaponDamage', label: 'Waffenschaden', description: '+2 % Schaden', icon: '✦' },
  { key: 'reloadSpeed', label: 'Nachladen', description: '+2 % schneller', icon: '↻' },
  { key: 'magazineSize', label: 'Magazingröße', description: '+2 % Kapazität', icon: '▥' },
  { key: 'reserveAmmo', label: 'Munitionsvorrat', description: '+2 % Reserve', icon: '⛁' },
  { key: 'grenadeDamage', label: 'Granatenschaden', description: '+2 % Schaden', icon: '●' },
  { key: 'grenadeCooldown', label: 'Granaten-Cooldown', description: '+2 % schneller', icon: '◷' },
  {
    key: 'grenadeRadius',
    label: 'Granaten-Explosionsradius',
    description: '+2 % Radius der Granatenexplosion',
    icon: '◎',
  },
  { key: 'barricadeHealth', label: 'Barrikadenleben', description: '+2 % Leben', icon: '▰' },
  { key: 'turretDamage', label: 'Turmschaden', description: '+2 % Schaden', icon: '⌖' },
  { key: 'turretRange', label: 'Turmreichweite', description: '+1 % Reichweite', icon: '◈' },
  { key: 'reviveSpeed', label: 'Wiederbelebung', description: '+2 % schneller', icon: '✚' },
];

/** One-time buys that change a rule instead of a number. */
export const PERK_DEFINITIONS: PerkDefinition[] = [
  {
    key: 'starterWeapon',
    label: 'Waffenhändler',
    description: 'Die erste gekaufte Waffe eines Runs kostet 40 % weniger.',
    icon: '⚒',
  },
  {
    key: 'starterBarricade',
    label: 'Bausatz',
    description: 'Die ersten vier Barrikaden eines Runs kosten 40 % weniger.',
    icon: '▰',
  },
  {
    key: 'starterTurret',
    label: 'Erstausstattung',
    description: 'Der erste Turm eines Runs kostet 40 % weniger.',
    icon: '⌖',
  },
  {
    key: 'dashShock',
    label: 'Stoßdash',
    description: 'Der Dash schleudert Zombies weg und verletzt sie.',
    icon: '✺',
  },
  {
    key: 'fieldMedic',
    label: 'Sanitäter',
    description: 'Wiederbeleben geht doppelt so schnell, der Trupp steht mit 70 % Leben auf.',
    icon: '✚',
  },
  {
    key: 'engineer',
    label: 'Techniker',
    description: 'Reparaturen kosten 40 % weniger.',
    icon: '⚙',
  },
  {
    key: 'extraGrenade',
    label: 'Zweiter Gürtel',
    description: 'Eine Granate mehr im Gürtel.',
    icon: '●',
  },
  {
    key: 'lastStand',
    label: 'Letztes Aufbäumen',
    description: 'Einmal pro Welle überlebst du einen tödlichen Treffer mit 1 Leben.',
    icon: '⛨',
  },
];

interface StoredProgress {
  gold: number;
  upgrades: PermanentUpgrades;
  perks: PermanentPerks;
  rewardedRuns: string[];
  clearedMaps: string[];
}

/** Perks that were dropped again, with the price they were bought for. */
const RETIRED_PERKS: Record<string, number> = {
  // "Reserveschub" only repeated what the dash-charge upgrade already does.
  extraDash: 1600,
};

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly storageKey = 'zombie-defense-progress-v1';
  private readonly progress = signal<StoredProgress>(this.load());

  readonly gold = computed(() => this.progress().gold);
  readonly upgrades = computed(() => this.progress().upgrades);
  readonly perks = computed(() => this.progress().perks);
  readonly clearedMaps = computed(() => this.progress().clearedMaps);

  constructor() {
    this.refundRetiredPerks();
  }

  maxLevel(key: UpgradeKey) {
    return upgradeMaxLevel(key);
  }

  cost(key: UpgradeKey) {
    return upgradeLevelCost(key, this.progress().upgrades[key]);
  }

  buy(key: UpgradeKey) {
    const current = this.progress();
    const cost = this.cost(key);
    if (current.gold < cost || current.upgrades[key] >= upgradeMaxLevel(key)) return false;
    this.save({
      ...current,
      gold: current.gold - cost,
      upgrades: { ...current.upgrades, [key]: current.upgrades[key] + 1 },
    });
    return true;
  }

  perkCost(key: PerkKey) {
    return PERK_COST[key];
  }

  ownsPerk(key: PerkKey) {
    return this.progress().perks[key];
  }

  buyPerk(key: PerkKey) {
    const current = this.progress();
    if (current.perks[key] || current.gold < PERK_COST[key]) return false;
    this.save({
      ...current,
      gold: current.gold - PERK_COST[key],
      perks: { ...current.perks, [key]: true },
    });
    return true;
  }

  isCleared(mapId: string) {
    return this.progress().clearedMaps.includes(mapId);
  }

  /** The first map is always open, every other map needs the previous one cleared. */
  isUnlocked(mapId: string) {
    const index = MAPS.findIndex((map) => map.id === mapId);
    if (index <= 0) return true;
    return this.isCleared(MAPS[index - 1].id);
  }

  addRunReward(gold: number, runId: string, mapId?: string, victory = false) {
    const current = this.progress();
    if (!runId || current.rewardedRuns.includes(runId)) return false;
    const cleared =
      victory && mapId && !current.clearedMaps.includes(mapId)
        ? [...current.clearedMaps, mapId]
        : current.clearedMaps;
    this.save({
      ...current,
      gold: current.gold + Math.max(0, Math.floor(gold)),
      rewardedRuns: [...current.rewardedRuns.slice(-19), runId],
      clearedMaps: cleared,
    });
    return true;
  }

  /** Gold spent on a perk that no longer exists goes back to the player. */
  private refundRetiredPerks() {
    let refund = 0;
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}') as {
        perks?: Record<string, unknown>;
      };
      for (const [key, cost] of Object.entries(RETIRED_PERKS)) {
        if (stored.perks?.[key]) refund += cost;
      }
    } catch {
      return;
    }
    if (refund === 0) return;
    // Saving drops the retired flag as well, so this pays out exactly once.
    const current = this.progress();
    this.save({ ...current, gold: current.gold + refund });
  }

  private load(): StoredProgress {
    try {
      const stored = JSON.parse(
        localStorage.getItem(this.storageKey) ?? '{}',
      ) as Partial<StoredProgress>;
      const savedUpgrades = (stored.upgrades ?? {}) as Record<string, unknown>;
      const savedPerks = (stored.perks ?? {}) as Record<string, unknown>;
      return {
        gold: Math.max(0, Number(stored.gold) || 0),
        // Only known entries survive, so a removed one leaves no leftovers.
        upgrades: Object.fromEntries(
          Object.keys(EMPTY_UPGRADES).map((key) => [
            key,
            Math.min(
              upgradeMaxLevel(key as UpgradeKey),
              Math.max(0, Math.floor(Number(savedUpgrades[key]) || 0)),
            ),
          ]),
        ) as unknown as PermanentUpgrades,
        perks: Object.fromEntries(
          Object.keys(EMPTY_PERKS).map((key) => [key, Boolean(savedPerks[key])]),
        ) as unknown as PermanentPerks,
        rewardedRuns: Array.isArray(stored.rewardedRuns) ? stored.rewardedRuns.slice(-20) : [],
        clearedMaps: Array.isArray(stored.clearedMaps) ? stored.clearedMaps : [],
      };
    } catch {
      return {
        gold: 0,
        upgrades: { ...EMPTY_UPGRADES },
        perks: { ...EMPTY_PERKS },
        rewardedRuns: [],
        clearedMaps: [],
      };
    }
  }

  private save(progress: StoredProgress) {
    this.progress.set(progress);
    localStorage.setItem(this.storageKey, JSON.stringify(progress));
  }
}
