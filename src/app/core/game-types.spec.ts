import {
  ARENA,
  BARRICADE_ORDER,
  DEFENSES,
  MAPS,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  TURRET_ORDER,
  VIEWPORT,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  type WeaponType,
} from '../../../shared/game-types';

function dps(weapon: WeaponType) {
  const config = WEAPONS[weapon];
  return (config.damage * config.pellets * 1000) / config.fireDelay;
}

describe('map campaign', () => {
  it('offers four maps that get harder and pay out more', () => {
    expect(MAPS).toHaveLength(4);
    for (let index = 1; index < MAPS.length; index += 1) {
      expect(MAPS[index].difficulty).toBeGreaterThan(MAPS[index - 1].difficulty);
      expect(MAPS[index].reward).toBeGreaterThan(MAPS[index - 1].reward);
      expect(MAPS[index].waves.length).toBeGreaterThanOrEqual(MAPS[index - 1].waves.length);
    }
  });

  it('ends every map with exactly one boss wave', () => {
    for (const map of MAPS) {
      const bossWaves = map.waves.filter((wave) => wave.kind === 'boss');
      expect(bossWaves).toHaveLength(1);
      expect(map.waves[map.waves.length - 1].kind).toBe('boss');
      expect(bossWaves[0].zombies[0]).toBe('boss');
    }
  });

  it('schedules fixed mini boss waves before the finale', () => {
    for (const map of MAPS) {
      const miniWaves = map.waves.filter((wave) => wave.kind === 'mini');
      expect(miniWaves.length).toBeGreaterThanOrEqual(1);
      expect(miniWaves.every((wave) => wave.zombies.includes('brute'))).toBe(true);
    }
  });

  it('keeps the spawn area free of obstacles', () => {
    const centreX = ARENA.width / 2;
    const centreY = ARENA.height / 2;
    for (const map of MAPS) {
      for (const obstacle of map.obstacles) {
        const closestX = Math.max(
          obstacle.x - obstacle.w / 2,
          Math.min(centreX, obstacle.x + obstacle.w / 2),
        );
        const closestY = Math.max(
          obstacle.y - obstacle.h / 2,
          Math.min(centreY, obstacle.y + obstacle.h / 2),
        );
        expect(Math.hypot(centreX - closestX, centreY - closestY)).toBeGreaterThan(150);
      }
    }
  });
});

describe('enemy roster', () => {
  it('contains the exploder and both boss ranks', () => {
    expect(ZOMBIES.exploder.explode).toBeDefined();
    expect(ZOMBIES.brute.rank).toBe('mini');
    expect(ZOMBIES.boss.rank).toBe('boss');
    expect(ZOMBIES.boss.health).toBeGreaterThan(ZOMBIES.brute.health);
  });

  it('pays more money for tougher enemies', () => {
    expect(ZOMBIES.big.reward).toBeGreaterThan(ZOMBIES.normal.reward);
    expect(ZOMBIES.boss.reward).toBeGreaterThan(ZOMBIES.brute.reward);
  });
});

describe('weapon balance', () => {
  it('lists ten weapons ordered by price', () => {
    expect(WEAPON_ORDER).toHaveLength(10);
    for (let index = 1; index < WEAPON_ORDER.length; index += 1) {
      expect(WEAPONS[WEAPON_ORDER[index]].cost).toBeGreaterThan(
        WEAPONS[WEAPON_ORDER[index - 1]].cost,
      );
    }
  });

  it('makes every paid weapon stronger than the free pistol', () => {
    for (const weapon of WEAPON_ORDER) {
      if (weapon === 'pistol') continue;
      expect(dps(weapon)).toBeGreaterThan(dps('pistol'));
    }
  });

  it('gives the special weapons their signature effect', () => {
    expect(WEAPONS.rocket.splashRadius).toBeGreaterThan(0);
    expect(WEAPONS.tesla.chain).toBeGreaterThan(0);
    expect(WEAPONS.flamer.burn).toBeGreaterThan(0);
    expect(WEAPONS.laser.pierce).toBeGreaterThan(WEAPONS.rifle.pierce);
    expect(WEAPONS.flamer.range).toBeLessThan(WEAPONS.sniper.range);
  });
});

describe('defenses', () => {
  it('offers four barricades and three turrets', () => {
    expect(BARRICADE_ORDER).toHaveLength(4);
    expect(TURRET_ORDER).toHaveLength(3);
    expect(BARRICADE_ORDER.every((type) => DEFENSES[type].kind === 'barricade')).toBe(true);
    expect(TURRET_ORDER.every((type) => DEFENSES[type].kind === 'turret')).toBe(true);
  });

  it('trades barricade price for durability', () => {
    for (let index = 1; index < BARRICADE_ORDER.length; index += 1) {
      const current = DEFENSES[BARRICADE_ORDER[index]];
      const previous = DEFENSES[BARRICADE_ORDER[index - 1]];
      expect(current.cost).toBeGreaterThan(previous.cost);
      expect(current.health).toBeGreaterThan(previous.health);
    }
  });

  it('gives every turret a range and a fire rate', () => {
    for (const type of TURRET_ORDER) {
      expect(DEFENSES[type].range).toBeGreaterThan(0);
      expect(DEFENSES[type].fireDelay).toBeGreaterThan(0);
      expect(DEFENSES[type].damage).toBeGreaterThan(0);
    }
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
