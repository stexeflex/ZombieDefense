import {
  ARENA,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  VIEWPORT,
  WAVES,
} from '../../../shared/game-types';

describe('fixed wave plan', () => {
  it('contains ten deterministic wave definitions', () => {
    expect(WAVES).toHaveLength(10);
    expect(WAVES[0]).toHaveLength(15);
    expect(WAVES[1]).toHaveLength(22);
  });

  it('uses only the three MVP zombie types', () => {
    const allowed = new Set(['normal', 'fast', 'big']);
    expect(WAVES.flat().every((type) => allowed.has(type))).toBe(true);
  });
});

describe('arena and revive rules', () => {
  it('uses a world larger than the visible camera viewport', () => {
    expect(ARENA.width).toBeGreaterThan(VIEWPORT.width);
    expect(ARENA.height).toBeGreaterThan(VIEWPORT.height);
  });

  it('keeps automatic reviving short and proximity based', () => {
    expect(REVIVE_RADIUS).toBeGreaterThan(50);
    expect(REVIVE_SECONDS).toBeLessThanOrEqual(2);
  });
});
