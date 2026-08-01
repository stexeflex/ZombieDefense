import { Injectable, computed, signal } from '@angular/core';
import {
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  MAPS,
  isPlayerAbility,
  PERK_COST,
  PERK_REQUIRES,
  PLAYER_ABILITY_COST,
  UPGRADE_REQUIRES,
  effectiveUpgrades as applyUpgradeAmplifier,
  perkUnlocked,
  upgradeLevelCost,
  upgradeMaxLevel,
  upgradeUnlocked,
  type PermanentPerks,
  type PermanentUpgrades,
  type PerkKey,
  type PlayerAbilityType,
  type UpgradeKey,
} from '../../../shared/game-types';
import { PERK_DEFINITIONS } from './upgrade-catalog';
import {
  isSealedProgressStorage,
  openProgressStorage,
  sealProgressStorage,
} from './progress-storage';

export {
  PERK_DEFINITIONS,
  UPGRADE_DEFINITIONS,
  UPGRADE_GROUPS,
  upgradeCurrentValue,
} from './upgrade-catalog';
export type { PerkKey, UpgradeKey };

interface StoredProgress {
  gold: number;
  upgrades: PermanentUpgrades;
  perks: PermanentPerks;
  ability: PlayerAbilityType;
  unlockedAbilities: PlayerAbilityType[];
  rewardedRuns: string[];
  /** Highest payout already credited for each recent run, so a later result can pay the delta. */
  rewardedRunPayouts: Record<string, number>;
  clearedMaps: string[];
}

/** Removed purchases and their original prices, so an update never destroys spent gold. */
const RETIRED_PERKS: Record<string, number> = {
  // "Reserveschub" only repeated what the dash-charge upgrade already does.
  extraDash: 1600,
};

const RETIRED_UPGRADE_REFUNDS: Record<string, (level: number) => number> = {
  // Wiederbelebung used the former regular curve: 40 + 16 gold per owned level.
  reviveSpeed: (level) =>
    Array.from(
      { length: Math.min(40, Math.max(0, Math.floor(level))) },
      (_, index) => 40 + index * 16,
    ).reduce((sum, cost) => sum + cost, 0),
};

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly storageKey = 'zombie-defense-progress-v1';
  private loadedRecord: {
    perks?: Record<string, unknown>;
    upgrades?: Record<string, unknown>;
  } = {};
  private loadedLegacy = false;
  private readonly progress = signal<StoredProgress>(this.load());

  readonly gold = computed(() => this.progress().gold);
  readonly upgrades = computed(() => this.progress().upgrades);
  readonly perks = computed(() => this.progress().perks);
  readonly effectiveUpgrades = computed(() =>
    applyUpgradeAmplifier(this.progress().upgrades, this.progress().perks),
  );
  readonly ability = computed(() => this.progress().ability);
  readonly unlockedAbilities = computed(() => this.progress().unlockedAbilities);
  readonly clearedMaps = computed(() => this.progress().clearedMaps);

  constructor() {
    this.refundRetiredProgress();
    // Existing plain JSON is accepted once and immediately migrated without
    // taking away any purchases or map unlocks.
    if (this.loadedLegacy) this.save(this.progress());
  }

  maxLevel(key: UpgradeKey) {
    return upgradeMaxLevel(key, this.progress().perks);
  }

  cost(key: UpgradeKey) {
    return upgradeLevelCost(key, this.progress().upgrades[key]);
  }

  /** False while the perk this upgrade scales is still missing. */
  unlocked(key: UpgradeKey) {
    return upgradeUnlocked(key, this.progress().perks);
  }

  /** Names of the perks that would open a locked upgrade, for the shop card. */
  lockedBy(key: UpgradeKey) {
    if (this.unlocked(key)) return '';
    return (UPGRADE_REQUIRES[key] ?? [])
      .map((perk) => PERK_DEFINITIONS.find((entry) => entry.key === perk)?.label ?? perk)
      .join(' oder ');
  }

  buy(key: UpgradeKey) {
    const current = this.progress();
    const cost = this.cost(key);
    if (!this.unlocked(key)) return false;
    if (current.gold < cost || current.upgrades[key] >= this.maxLevel(key)) return false;
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

  perkUnlocked(key: PerkKey) {
    return perkUnlocked(key, this.progress().perks);
  }

  perkLockedBy(key: PerkKey) {
    const required = PERK_REQUIRES[key];
    if (!required || this.ownsPerk(required)) return '';
    return PERK_DEFINITIONS.find((entry) => entry.key === required)?.label ?? required;
  }

  buyPerk(key: PerkKey) {
    const current = this.progress();
    if (current.perks[key] || !perkUnlocked(key, current.perks) || current.gold < PERK_COST[key]) {
      return false;
    }
    this.save({
      ...current,
      gold: current.gold - PERK_COST[key],
      perks: { ...current.perks, [key]: true },
    });
    return true;
  }

  abilityCost(ability: PlayerAbilityType) {
    return PLAYER_ABILITY_COST[ability];
  }

  abilityUnlocked(ability: PlayerAbilityType) {
    return this.progress().unlockedAbilities.includes(ability);
  }

  /** Buying only unlocks an ability; equipping is a separate, deliberate action. */
  buyAbility(ability: PlayerAbilityType) {
    const current = this.progress();
    const cost = PLAYER_ABILITY_COST[ability];
    if (
      !isPlayerAbility(ability) ||
      current.unlockedAbilities.includes(ability) ||
      current.gold < cost
    ) {
      return false;
    }
    this.save({
      ...current,
      gold: current.gold - cost,
      unlockedAbilities: [...current.unlockedAbilities, ability],
    });
    return true;
  }

  /** Exactly one unlocked G ability is equipped; changing it is free and lobby-safe. */
  selectAbility(ability: PlayerAbilityType) {
    const current = this.progress();
    if (
      !isPlayerAbility(ability) ||
      !current.unlockedAbilities.includes(ability) ||
      current.ability === ability
    ) {
      return false;
    }
    this.save({ ...current, ability });
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
    if (!runId) return false;
    const knownRun = current.rewardedRuns.includes(runId);
    const recordedPayout = current.rewardedRunPayouts[runId];
    // Old saves only know that a run was paid, not how much. They stay closed
    // so an update cannot accidentally pay an already completed run twice.
    if (knownRun && recordedPayout === undefined) return false;
    const payout = Math.max(0, Math.floor(Number(gold) || 0));
    const previousPayout = Math.max(0, recordedPayout ?? 0);
    const extraGold = Math.max(0, payout - previousPayout);
    const newlyCleared = Boolean(victory && mapId && !current.clearedMaps.includes(mapId));
    if (knownRun && extraGold === 0 && !newlyCleared) return false;

    const cleared = newlyCleared && mapId ? [...current.clearedMaps, mapId] : current.clearedMaps;
    const rewardedRuns = [...current.rewardedRuns.filter((id) => id !== runId).slice(-19), runId];
    const rewardedRunPayouts = Object.fromEntries(
      rewardedRuns
        .filter((id) => id === runId || current.rewardedRunPayouts[id] !== undefined)
        .map((id) => [
          id,
          id === runId ? Math.max(previousPayout, payout) : current.rewardedRunPayouts[id],
        ]),
    );
    this.save({
      ...current,
      gold: current.gold + extraGold,
      rewardedRuns,
      rewardedRunPayouts,
      clearedMaps: cleared,
    });
    return true;
  }

  /** Gold spent on removed perks or upgrades goes back exactly once. */
  private refundRetiredProgress() {
    let refund = 0;
    for (const [key, cost] of Object.entries(RETIRED_PERKS)) {
      if (this.loadedRecord.perks?.[key]) refund += cost;
    }
    for (const [key, calculate] of Object.entries(RETIRED_UPGRADE_REFUNDS)) {
      refund += calculate(Number(this.loadedRecord.upgrades?.[key]) || 0);
    }
    if (refund === 0) return;
    // Saving drops retired keys as well, so the refund cannot be paid twice.
    const current = this.progress();
    this.save({ ...current, gold: current.gold + refund });
  }

  private load(): StoredProgress {
    try {
      const raw = localStorage.getItem(this.storageKey) ?? '';
      const decoded = isSealedProgressStorage(raw)
        ? openProgressStorage(raw)
        : raw
          ? JSON.parse(raw)
          : {};
      if (!decoded || typeof decoded !== 'object') throw new Error('Invalid progress payload');
      const stored = decoded as Partial<StoredProgress>;
      this.loadedRecord = {
        perks: stored.perks as unknown as Record<string, unknown>,
        upgrades: stored.upgrades as unknown as Record<string, unknown>,
      };
      this.loadedLegacy = Boolean(raw && !isSealedProgressStorage(raw));
      const savedUpgrades = (stored.upgrades ?? {}) as Record<string, unknown>;
      const savedPerks = (stored.perks ?? {}) as Record<string, unknown>;
      const perks = Object.fromEntries(
        Object.keys(EMPTY_PERKS).map((key) => [key, Boolean(savedPerks[key])]),
      ) as unknown as PermanentPerks;
      const rewardedRuns = Array.isArray(stored.rewardedRuns)
        ? stored.rewardedRuns.filter((id): id is string => typeof id === 'string').slice(-20)
        : [];
      const storedPayouts =
        stored.rewardedRunPayouts && typeof stored.rewardedRunPayouts === 'object'
          ? stored.rewardedRunPayouts
          : {};
      const unlockedAbilities = Array.from(
        new Set<PlayerAbilityType>([
          'grenade',
          ...(Array.isArray(stored.unlockedAbilities)
            ? stored.unlockedAbilities.filter(isPlayerAbility)
            : []),
        ]),
      );
      const ability =
        isPlayerAbility(stored.ability) && unlockedAbilities.includes(stored.ability)
          ? stored.ability
          : 'grenade';
      return {
        gold: Math.max(0, Number(stored.gold) || 0),
        ability,
        unlockedAbilities,
        // Only known entries survive, so a removed one leaves no leftovers.
        upgrades: Object.fromEntries(
          Object.keys(EMPTY_UPGRADES).map((key) => [
            key,
            Math.min(
              upgradeMaxLevel(key as UpgradeKey, perks),
              Math.max(0, Math.floor(Number(savedUpgrades[key]) || 0)),
            ),
          ]),
        ) as unknown as PermanentUpgrades,
        perks,
        rewardedRuns,
        rewardedRunPayouts: Object.fromEntries(
          rewardedRuns.flatMap((id) => {
            const payout = Number(storedPayouts[id]);
            return Number.isFinite(payout) ? [[id, Math.max(0, Math.floor(payout))]] : [];
          }),
        ),
        clearedMaps: Array.isArray(stored.clearedMaps) ? stored.clearedMaps : [],
      };
    } catch {
      return {
        gold: 0,
        ability: 'grenade',
        unlockedAbilities: ['grenade'],
        upgrades: { ...EMPTY_UPGRADES },
        perks: { ...EMPTY_PERKS },
        rewardedRuns: [],
        rewardedRunPayouts: {},
        clearedMaps: [],
      };
    }
  }

  private save(progress: StoredProgress) {
    this.progress.set(progress);
    localStorage.setItem(this.storageKey, sealProgressStorage(progress));
  }
}
