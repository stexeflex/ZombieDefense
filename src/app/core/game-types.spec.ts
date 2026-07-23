import { WAVES } from '../../../shared/game-types';

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
