import {
  ProgressService,
  UPGRADE_DEFINITIONS,
  UPGRADE_GROUPS,
  upgradeCurrentValue,
} from './progress.service';

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
});

describe('ProgressService upgrade shop', () => {
  beforeEach(() => localStorage.clear());

  it('groups every levelled upgrade into the seven readable shop sections', () => {
    expect(UPGRADE_GROUPS.map((group) => group.label)).toEqual([
      'Spieler',
      'Waffen (alle)',
      'Nahkampf',
      'Granaten',
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
  });

  it('refunds old Wiederbelebung levels once and removes them from the save', () => {
    localStorage.setItem(
      'zombie-defense-progress-v1',
      JSON.stringify({ gold: 10, upgrades: { reviveSpeed: 3 } }),
    );

    const progress = new ProgressService();
    expect(progress.gold()).toBe(178);
    expect(progress.upgrades()).not.toHaveProperty('reviveSpeed');

    const reloaded = new ProgressService();
    expect(reloaded.gold()).toBe(178);
  });
});
