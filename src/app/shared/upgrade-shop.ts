import { Component, computed, inject, output, signal } from '@angular/core';
import {
  PLAYER_ABILITIES,
  PLAYER_ABILITY_ORDER,
  type PlayerAbilityType,
} from '../../../shared/game-types';
import {
  PERK_DEFINITIONS,
  UPGRADE_DEFINITIONS,
  UPGRADE_GROUPS,
  upgradeCurrentValue,
} from '../core/upgrade-catalog';
import { ProgressService, type PerkKey, type UpgradeKey } from '../core/progress.service';

/** The gold shop as a dialog, used by the start page and by the lobby. */
@Component({
  selector: 'app-upgrade-shop',
  templateUrl: './upgrade-shop.html',
  styleUrl: './upgrade-shop.scss',
})
export class UpgradeShop {
  readonly progress = inject(ProgressService);
  /** A purchase in the lobby has to reach the server, so it is announced. */
  readonly bought = output<void>();
  readonly closed = output<void>();
  readonly shopTab = signal<'levels' | 'perks' | 'abilities'>('levels');
  readonly definitions = UPGRADE_DEFINITIONS;
  private readonly allGroups = UPGRADE_GROUPS.map((group) => ({
    ...group,
    upgrades: UPGRADE_DEFINITIONS.filter((upgrade) => upgrade.category === group.key),
  }));
  readonly groups = this.allGroups.filter(
    (group) => !['grenades', 'mortar', 'precision'].includes(group.key),
  );
  readonly abilityGroups = this.allGroups.filter((group) =>
    ['grenades', 'mortar', 'precision'].includes(group.key),
  );
  private readonly abilityPerkKeys = new Set<PerkKey>([
    'extraGrenade',
    'mortarNapalm',
    'extraMortar',
    'precisionReload',
    'extraPrecision',
  ]);
  readonly perkDefinitions = PERK_DEFINITIONS.filter((perk) => !this.abilityPerkKeys.has(perk.key));
  readonly abilities = PLAYER_ABILITY_ORDER.map((type) => ({ type, ...PLAYER_ABILITIES[type] }));
  readonly selectedAbilityGroup = computed(() => {
    const groupKey =
      this.progress.ability() === 'grenade'
        ? 'grenades'
        : this.progress.ability() === 'mortarStrike'
          ? 'mortar'
          : 'precision';
    return this.abilityGroups.find((group) => group.key === groupKey)!;
  });
  readonly selectedAbilityPerks = computed(() => {
    const perkKeys: PerkKey[] =
      this.progress.ability() === 'grenade'
        ? ['extraGrenade']
        : this.progress.ability() === 'mortarStrike'
          ? ['mortarNapalm', 'extraMortar']
          : ['precisionReload', 'extraPrecision'];
    return PERK_DEFINITIONS.filter((perk) => perkKeys.includes(perk.key));
  });
  /**
   * A short ladder gets one pip per level, so a pip always means a level. Long
   * ladders would need forty of them, there a filled bar is far easier to read.
   */
  private readonly pipSteps = new Map<UpgradeKey, number[]>(
    UPGRADE_DEFINITIONS.filter((upgrade) => this.progress.maxLevel(upgrade.key) <= 10).map(
      (upgrade) => [
        upgrade.key,
        Array.from({ length: this.progress.maxLevel(upgrade.key) }, (_, index) => index + 1),
      ],
    ),
  );

  buyUpgrade(key: UpgradeKey) {
    if (this.progress.buy(key)) this.bought.emit();
  }

  buyPerk(key: PerkKey) {
    if (this.progress.buyPerk(key)) this.bought.emit();
  }

  chooseAbility(ability: PlayerAbilityType) {
    const changed = this.progress.abilityUnlocked(ability)
      ? this.progress.selectAbility(ability)
      : this.progress.buyAbility(ability);
    if (changed) this.bought.emit();
  }

  level(key: UpgradeKey) {
    return this.progress.upgrades()[key];
  }

  currentValue(key: UpgradeKey) {
    return upgradeCurrentValue(key, this.level(key));
  }

  /** An upgrade whose perk is missing stays visible, but cannot be bought. */
  unlocked(key: UpgradeKey) {
    return this.progress.unlocked(key);
  }

  lockedBy(key: UpgradeKey) {
    return this.progress.lockedBy(key);
  }

  maxLevel(key: UpgradeKey) {
    return this.progress.maxLevel(key);
  }

  /** The pips of a short ladder, or nothing when the bar is used instead. */
  pips(key: UpgradeKey) {
    return this.pipSteps.get(key);
  }

  fillPercent(key: UpgradeKey) {
    return (this.level(key) / this.maxLevel(key)) * 100;
  }

  maxed(key: UpgradeKey) {
    return this.level(key) >= this.maxLevel(key);
  }
}
