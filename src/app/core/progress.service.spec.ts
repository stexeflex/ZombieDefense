import { ProgressService, UPGRADE_DEFINITIONS } from './progress.service';

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
  it('offers maximum player health as a levelled upgrade', () => {
    const health = UPGRADE_DEFINITIONS.find((upgrade) => upgrade.key === 'maxHealth');

    expect(health?.label).toContain('Spielerleben');
    expect(health?.description).toContain('maximales Leben');
  });
});
