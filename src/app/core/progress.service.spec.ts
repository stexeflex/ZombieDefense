import {
  ProgressService,
  UPGRADE_DEFINITIONS,
  UPGRADE_GROUPS,
  upgradeCurrentValue,
} from './progress.service';
import { PLAYER_ABILITY_COST } from '../../../shared/game-types';

describe('ProgressService run rewards', () => {
  beforeEach(() => localStorage.clear());

  it('credits only the larger payout delta after a reconnect', () => {
    const progress = new ProgressService();

    expect(progress.addRunReward(120, 'run-rejoin', 'streets', false)).toBe(true);
    expect(progress.gold()).toBe(120);
    expect(progress.addRunReward(120, 'run-rejoin', 'streets', false)).toBe(false);
    expect(progress.gold()).toBe(120);

    expect(progress.addRunReward(420, 'run-rejoin', 'streets', true)).toBe(true);
    expect(progress.gold()).toBe(420);
    expect(progress.isCleared('streets')).toBe(true);
  });

  it('does not reopen a legacy run whose old save has no payout amount', () => {
    localStorage.setItem(
      'zombie-defense-progress-v1',
      JSON.stringify({ gold: 75, rewardedRuns: ['legacy-run'] }),
    );
    const progress = new ProgressService();

    expect(progress.addRunReward(500, 'legacy-run', 'outpost', true)).toBe(false);
    expect(progress.gold()).toBe(75);
    expect(progress.isCleared('outpost')).toBe(false);
  });

  it('seals progress, reloads it and rejects a hand-edited payload', () => {
    const progress = new ProgressService();
    progress.addRunReward(275, 'sealed-run', 'streets', true);

    const stored = localStorage.getItem('zombie-defense-progress-v1') ?? '';
    expect(stored.startsWith('ZD2.')).toBe(true);
    expect(stored).not.toContain('"gold"');
    expect(new ProgressService().gold()).toBe(275);

    const changed = `${stored.slice(0, -2)}${stored.at(-2) === 'A' ? 'B' : 'A'}${stored.at(-1)}`;
    localStorage.setItem('zombie-defense-progress-v1', changed);
    expect(new ProgressService().gold()).toBe(0);
  });
});

describe('ProgressService upgrade shop', () => {
  beforeEach(() => localStorage.clear());

  it('groups regular and active-ability upgrades into readable shop sections', () => {
    expect(UPGRADE_GROUPS.map((group) => group.label)).toEqual([
      'Spieler',
      'Waffen (alle)',
      'Nahkampf',
      'Granaten',
      'Mörserschlag',
      'Vernichtungsschuss',
      'Nullpunktkern',
      'Barrikaden',
      'Türme',
      'Fahrzeuge',
      'Dash',
    ]);
    expect(
      UPGRADE_DEFINITIONS.every((upgrade) =>
        UPGRADE_GROUPS.some((group) => group.key === upgrade.category),
      ),
    ).toBe(true);
    expect(UPGRADE_DEFINITIONS.map((upgrade) => String(upgrade.key))).not.toContain('reviveSpeed');
  });

  it('shows the current value together with the gain per level', () => {
    expect(upgradeCurrentValue('healthRegen', 16)).toBe('4 Leben pro Sekunde (+0,25 pro Stufe)');
    expect(upgradeCurrentValue('maxHealth', 5)).toContain('110 maximales Leben');
    expect(upgradeCurrentValue('dashCharges', 2)).toContain('4 Dash-Ladungen');
    expect(upgradeCurrentValue('grenadeSplit', 6)).toContain('6 Mini-Granaten');
    expect(upgradeCurrentValue('mortarSlow', 4)).toContain('1,5 s Verlangsamung');
    expect(upgradeCurrentValue('precisionExecute', 10)).toContain('+30 %');
    expect(upgradeCurrentValue('precisionHealthDamage', 5)).toContain('5 % maximales Gegnerleben');
    expect(upgradeCurrentValue('nullCoreRadius', 10)).toContain('Kernreichweite');
    expect(upgradeCurrentValue('nullFieldRadius', 10)).toContain('Feldreichweite');
    expect(upgradeCurrentValue('armor', 35)).not.toContain('max.');
    expect(upgradeCurrentValue('vehicleArmor', 10)).toContain('10 % weniger Schaden');
  });

  it('starts with grenades and keeps advanced abilities locked until they are bought', () => {
    const progress = new ProgressService();
    expect(progress.ability()).toBe('grenade');
    expect(progress.abilityUnlocked('grenade')).toBe(true);
    expect(progress.abilityUnlocked('mortarStrike')).toBe(false);
    expect(progress.selectAbility('mortarStrike')).toBe(false);
    expect(PLAYER_ABILITY_COST.mortarStrike).toBe(PLAYER_ABILITY_COST.precisionShot);
    expect(PLAYER_ABILITY_COST.nullCore).toBeGreaterThan(PLAYER_ABILITY_COST.precisionShot);

    progress.addRunReward(PLAYER_ABILITY_COST.mortarStrike, 'ability-unlock');
    expect(progress.buyAbility('mortarStrike')).toBe(true);
    expect(progress.ability()).toBe('grenade');
    expect(progress.gold()).toBe(0);
    expect(progress.abilityUnlocked('mortarStrike')).toBe(true);
    expect(progress.selectAbility('mortarStrike')).toBe(true);
    expect(progress.ability()).toBe('mortarStrike');
    expect(new ProgressService().ability()).toBe('mortarStrike');
    expect(new ProgressService().abilityUnlocked('mortarStrike')).toBe(true);
  });

  it('makes amplifier levels available for purchase instead of granting them for free', () => {
    const progress = new ProgressService();
    progress.addRunReward(100000, 'amplifier-budget');

    expect(progress.buyPerk('upgradeAmplifier')).toBe(true);
    expect(progress.maxLevel('weaponDamage')).toBe(60);
    expect(progress.effectiveUpgrades().weaponDamage).toBe(0);
    for (let level = 0; level < 41; level += 1) expect(progress.buy('weaponDamage')).toBe(true);
    expect(progress.upgrades().weaponDamage).toBe(41);
    expect(progress.effectiveUpgrades().weaponDamage).toBe(41);
  });

  it('falls back to grenades when an old save selected a now-locked ability', () => {
    localStorage.setItem(
      'zombie-defense-progress-v1',
      JSON.stringify({ gold: 50, ability: 'precisionShot' }),
    );

    const progress = new ProgressService();
    expect(progress.ability()).toBe('grenade');
    expect(progress.abilityUnlocked('precisionShot')).toBe(false);
  });

  it('refunds old Wiederbelebung levels once and removes them from the save', () => {
    localStorage.setItem(
      'zombie-defense-progress-v1',
      JSON.stringify({ gold: 10, upgrades: { reviveSpeed: 3 } }),
    );

    const progress = new ProgressService();
    expect(progress.gold()).toBe(178);
    expect(progress.upgrades()).not.toHaveProperty('reviveSpeed');
    expect(localStorage.getItem('zombie-defense-progress-v1')).toMatch(/^ZD2\./);

    const reloaded = new ProgressService();
    expect(reloaded.gold()).toBe(178);
  });
});
