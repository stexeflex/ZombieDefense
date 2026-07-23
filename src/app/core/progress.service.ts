import { Injectable, computed, signal } from '@angular/core';
import {
  EMPTY_UPGRADES,
  type PermanentUpgrades,
} from '../../../shared/game-types';

export type UpgradeKey = keyof PermanentUpgrades;

export interface UpgradeDefinition {
  key: UpgradeKey;
  label: string;
  description: string;
  icon: string;
}

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { key: 'maxHealth', label: 'Maximales Leben', description: '+2 % Leben', icon: '♥' },
  { key: 'moveSpeed', label: 'Bewegung', description: '+2 % Tempo', icon: '➜' },
  { key: 'weaponDamage', label: 'Waffenschaden', description: '+2 % Schaden', icon: '✦' },
  { key: 'reloadSpeed', label: 'Nachladen', description: '+2 % schneller', icon: '↻' },
  { key: 'magazineSize', label: 'Magazingröße', description: '+2 % Kapazität', icon: '▥' },
  { key: 'grenadeDamage', label: 'Granatenschaden', description: '+2 % Schaden', icon: '●' },
  { key: 'grenadeCooldown', label: 'Granaten-Cooldown', description: '+2 % schneller', icon: '◷' },
  { key: 'grenadeRadius', label: 'Explosionsradius', description: '+2 % Radius', icon: '◎' },
  { key: 'barricadeHealth', label: 'Barrikadenleben', description: '+2 % Leben', icon: '▰' },
  { key: 'turretDamage', label: 'Turmschaden', description: '+2 % Schaden', icon: '⌖' },
];

interface StoredProgress {
  gold: number;
  upgrades: PermanentUpgrades;
  rewardedRuns: string[];
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly storageKey = 'zombie-defense-progress-v1';
  private readonly progress = signal<StoredProgress>(this.load());

  readonly gold = computed(() => this.progress().gold);
  readonly upgrades = computed(() => this.progress().upgrades);

  cost(key: UpgradeKey) {
    const level = this.progress().upgrades[key];
    return 50 + level * 35;
  }

  buy(key: UpgradeKey) {
    const current = this.progress();
    const cost = this.cost(key);
    if (current.gold < cost || current.upgrades[key] >= 20) return false;
    this.save({
      ...current,
      gold: current.gold - cost,
      upgrades: {
        ...current.upgrades,
        [key]: current.upgrades[key] + 1,
      },
    });
    return true;
  }

  addRunReward(gold: number, runId: string) {
    const current = this.progress();
    if (!runId || current.rewardedRuns.includes(runId)) return false;
    this.save({
      ...current,
      gold: current.gold + Math.max(0, Math.floor(gold)),
      rewardedRuns: [...current.rewardedRuns.slice(-19), runId],
    });
    return true;
  }

  private load(): StoredProgress {
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}') as Partial<StoredProgress>;
      return {
        gold: Math.max(0, Number(stored.gold) || 0),
        upgrades: {
          ...EMPTY_UPGRADES,
          ...(stored.upgrades ?? {}),
        },
        rewardedRuns: Array.isArray(stored.rewardedRuns) ? stored.rewardedRuns.slice(-20) : [],
      };
    } catch {
      return { gold: 0, upgrades: { ...EMPTY_UPGRADES }, rewardedRuns: [] };
    }
  }

  private save(progress: StoredProgress) {
    this.progress.set(progress);
    localStorage.setItem(this.storageKey, JSON.stringify(progress));
  }
}
