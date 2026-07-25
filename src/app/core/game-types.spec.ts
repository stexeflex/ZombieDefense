import {
  ARENA,
  BARRICADE_ORDER,
  DEFENSES,
  DEFENSE_REACH,
  EMPTY_UPGRADES,
  MAPS,
  REPAIR_COST_PER_HP,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  SELL_REFUND,
  TURRET_ORDER,
  UPGRADE_MAX_LEVEL,
  VIEWPORT,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  armorReduction,
  canPlaceDefense,
  defenseFootprint,
  distanceToDefense,
  repairCost,
  reserveCapacity,
  sellRefund,
  sellValue,
  snapDefense,
  upgradeCost,
  type MapObstacle,
  type PlacedDefense,
  type WeaponType,
} from '../../../shared/game-types';

function dps(weapon: WeaponType) {
  const config = WEAPONS[weapon];
  return (config.damage * config.pellets * 1000) / config.fireDelay;
}

describe('map campaign', () => {
  it('offers seven maps that get harder and pay out more', () => {
    expect(MAPS).toHaveLength(7);
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

describe('building rules', () => {
  const wood = DEFENSES.wood;
  const barricade = (x: number, y: number, rotation = 0): PlacedDefense => ({
    type: 'wood',
    x,
    y,
    rotation,
  });

  it('turns the footprint with the barricade', () => {
    expect(defenseFootprint('wood', 0)).toEqual({ w: wood.width, h: wood.height });
    expect(defenseFootprint('wood', Math.PI / 2)).toEqual({ w: wood.height, h: wood.width });
  });

  it('lets two barricades stand flush but not overlap', () => {
    const placed = barricade(1000, 800);
    expect(canPlaceDefense(barricade(1000 + wood.width, 800), [placed], [])).toBe(true);
    expect(canPlaceDefense(barricade(1000, 800 + wood.height), [placed], [])).toBe(true);
    expect(canPlaceDefense(barricade(1000 + wood.width - 6, 800), [placed], [])).toBe(false);
  });

  it('snaps a loose preview flush against its neighbour', () => {
    const placed = barricade(1000, 800);
    const loose = barricade(1000 + wood.width + 9, 800);
    expect(snapDefense(loose, [placed], []).x).toBe(1000 + wood.width);
    const faraway = barricade(1000 + wood.width + 120, 800);
    expect(snapDefense(faraway, [placed], []).x).toBe(faraway.x);
  });

  it('keeps structures off map obstacles', () => {
    const rock: MapObstacle = {
      x: 1000,
      y: 800,
      w: 80,
      h: 80,
      kind: 'rock',
      rotation: 0,
      solid: true,
    };
    expect(canPlaceDefense(barricade(1000, 800), [], [rock])).toBe(false);
    expect(canPlaceDefense(barricade(1000 + 40 + wood.width / 2, 800), [], [rock])).toBe(true);
  });

  it('measures reach from the edge of a structure', () => {
    const placed = barricade(1000, 800);
    expect(distanceToDefense(1000, 800, placed)).toBe(0);
    expect(distanceToDefense(1000 + wood.width / 2 + 30, 800, placed)).toBeCloseTo(30);
    expect(distanceToDefense(1000 + wood.width / 2 + DEFENSE_REACH + 1, 800, placed)).toBeGreaterThan(
      DEFENSE_REACH,
    );
  });

  it('prices repair by missing health and sell by build price', () => {
    expect(repairCost({ health: wood.health, maxHealth: wood.health })).toBe(0);
    expect(repairCost({ health: wood.health - 200, maxHealth: wood.health })).toBe(
      Math.ceil(200 * REPAIR_COST_PER_HP),
    );
    expect(sellRefund('wood')).toBe(Math.round(wood.cost * SELL_REFUND));
    for (const type of [...BARRICADE_ORDER, ...TURRET_ORDER]) {
      expect(sellRefund(type)).toBeLessThan(DEFENSES[type].cost);
    }
  });

  it('pays back the full price for a structure placed just now', () => {
    for (const type of [...BARRICADE_ORDER, ...TURRET_ORDER]) {
      expect(sellValue(type, true)).toBe(DEFENSES[type].cost);
      expect(sellValue(type, false)).toBe(sellRefund(type));
    }
  });
});

describe('arsenal and ammunition', () => {
  it('caps spare ammunition at one full resupply', () => {
    for (const weapon of WEAPON_ORDER) {
      expect(reserveCapacity(weapon)).toBe(WEAPONS[weapon].reserve);
      expect(reserveCapacity(weapon)).toBeGreaterThan(WEAPONS[weapon].magazine);
    }
  });
});

describe('permanent upgrades', () => {
  it('leaves room to specialise without runaway prices', () => {
    expect(UPGRADE_MAX_LEVEL).toBeGreaterThanOrEqual(40);
    for (let level = 1; level < UPGRADE_MAX_LEVEL; level += 1) {
      expect(upgradeCost(level)).toBeGreaterThan(upgradeCost(level - 1));
    }
    // A single level must stay affordable next to what a run pays out.
    expect(upgradeCost(UPGRADE_MAX_LEVEL - 1)).toBeLessThan(1000);
  });

  it('caps armour so no build becomes untouchable', () => {
    expect(armorReduction(0)).toBe(0);
    expect(armorReduction(10)).toBeCloseTo(0.1);
    expect(armorReduction(UPGRADE_MAX_LEVEL)).toBeLessThanOrEqual(0.35);
  });

  it('has dropped the money upgrade', () => {
    expect(Object.keys(EMPTY_UPGRADES)).not.toContain('income');
    expect(Object.values(EMPTY_UPGRADES).every((level) => level === 0)).toBe(true);
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
