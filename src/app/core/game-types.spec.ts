import {
  ARENA,
  BARRICADE_ORDER,
  BOSSES,
  DASH_BASE_CHARGES,
  DASH_BASE_RESIST,
  DASH_CUT_DAMAGE,
  DASH_RESIST_STEP,
  DASH_SECONDS,
  DASH_SHIELD_PER_HIT,
  DEFENSES,
  DEFENSE_REACH,
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  MAPS,
  MINI_BOSSES,
  PERK_COST,
  REPAIR_COST_PER_HP,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  SHIELD_DECAY,
  SHIELD_SHARE,
  START_MONEY,
  START_MONEY_PER_LEVEL,
  STARTER_DISCOUNT,
  TURRET_ORDER,
  UPGRADE_MAX_LEVEL,
  VIEWPORT,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  ZOMBIE_TYPES,
  ammoRefillCost,
  armorReduction,
  canPlaceDefense,
  dashReduction,
  defenseFootprint,
  discountedCost,
  distanceToDefense,
  endlessWave,
  repairCost,
  reserveCapacity,
  sellValue,
  snapDefense,
  splitAbility,
  startingMoney,
  timedAbilities,
  upgradeCost,
  upgradeLevelCost,
  upgradeMaxLevel,
  upgradeUnlocked,
  type MapObstacle,
  type PerkKey,
  type PlacedDefense,
  type WeaponType,
} from '../../../shared/game-types';

function dps(weapon: WeaponType) {
  const config = WEAPONS[weapon];
  return (config.damage * config.pellets * 1000) / config.fireDelay;
}

describe('map campaign', () => {
  it('offers ten maps that get harder and pay out more', () => {
    expect(MAPS).toHaveLength(10);
    for (let index = 1; index < MAPS.length; index += 1) {
      expect(MAPS[index].difficulty).toBeGreaterThan(MAPS[index - 1].difficulty);
      expect(MAPS[index].reward).toBeGreaterThan(MAPS[index - 1].reward);
      expect(MAPS[index].waves.length).toBeGreaterThanOrEqual(MAPS[index - 1].waves.length);
    }
  });

  it('pays enough boss gold to fund several upgrade paths across the campaign', () => {
    expect(MAPS.reduce((total, map) => total + map.reward, 0)).toBeGreaterThanOrEqual(34_000);
  });

  it('ends every map with its own boss', () => {
    const seen = new Set<string>();
    for (const map of MAPS) {
      const bossWaves = map.waves.filter((wave) => wave.kind === 'boss');
      expect(bossWaves).toHaveLength(1);
      expect(map.waves[map.waves.length - 1].kind).toBe('boss');
      expect(bossWaves[0].zombies[0]).toBe(map.boss);
      expect(ZOMBIES[map.boss].rank).toBe('boss');
      expect(seen.has(map.boss)).toBe(false);
      seen.add(map.boss);
    }
    expect(seen.size).toBe(BOSSES.length);
  });

  it('schedules mini boss and swarm waves before the finale', () => {
    for (const map of MAPS) {
      const miniWaves = map.waves.filter((wave) => wave.kind === 'mini');
      expect(miniWaves.length).toBeGreaterThanOrEqual(1);
      for (const wave of miniWaves) {
        expect(MINI_BOSSES).toContain(wave.zombies[0]);
      }
    }
    const swarmWaves = MAPS.flatMap((map) => map.waves).filter((wave) => wave.kind === 'swarm');
    expect(swarmWaves.length).toBeGreaterThan(0);
  });

  it('keeps making waves for the endless mode', () => {
    const boss = MAPS[0].boss;
    // Every third wave brings mini bosses, every fifth a swarm, every tenth the
    // boss of the map — and the horde keeps growing in between.
    expect(endlessWave(boss, 11).kind).toBe('normal');
    expect(endlessWave(boss, 12).kind).toBe('mini');
    expect(MINI_BOSSES).toContain(endlessWave(boss, 12).zombies[0]);
    expect(endlessWave(boss, 15).kind).toBe('swarm');
    expect(endlessWave(boss, 20).kind).toBe('boss');
    expect(endlessWave(boss, 20).zombies[0]).toBe(boss);
    expect(endlessWave(boss, 30).zombies.length).toBeGreaterThan(
      endlessWave(boss, 11).zombies.length,
    );
    // The same wave has to look the same every time it comes up.
    expect(endlessWave(boss, 17).zombies).toEqual(endlessWave(boss, 17).zombies);
    // A late wave stays a fight instead of an hour of mopping up.
    expect(endlessWave(boss, 400).zombies.length).toBeLessThan(200);
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
  it('covers trash, elites, mini bosses and one boss per map', () => {
    expect(ZOMBIE_TYPES.length).toBeGreaterThanOrEqual(20);
    expect(ZOMBIES.exploder.explode).toBeDefined();
    expect(MINI_BOSSES.every((type) => ZOMBIES[type].rank === 'mini')).toBe(true);
    expect(BOSSES.every((type) => ZOMBIES[type].rank === 'boss')).toBe(true);
    expect(BOSSES).toHaveLength(MAPS.length);
  });

  it('pays more money for tougher enemies', () => {
    expect(ZOMBIES.big.reward).toBeGreaterThan(ZOMBIES.normal.reward);
    expect(ZOMBIES.butcher.reward).toBeGreaterThan(ZOMBIES.brute.reward);
    expect(ZOMBIES.omega.reward).toBeGreaterThan(ZOMBIES.butcher.reward);
  });

  it('gives every boss something the others do not have', () => {
    for (const boss of BOSSES) {
      expect((ZOMBIES[boss].abilities ?? []).length).toBeGreaterThan(0);
    }
    expect(splitAbility('brood')).toBeDefined();
    expect(timedAbilities('warlord').some((ability) => ability.kind === 'heal')).toBe(true);
    expect(timedAbilities('artillery').some((ability) => ability.kind === 'mortar')).toBe(true);
    expect(timedAbilities('vortex').some((ability) => ability.kind === 'vortex')).toBe(true);
    expect(timedAbilities('slag').some((ability) => ability.kind === 'puddle')).toBe(true);
    expect(
      timedAbilities('render').some((ability) => ability.kind === 'slam' && ability.telegraph),
    ).toBe(true);
  });

  it('lets the final boss borrow from everyone but never heal itself', () => {
    const omega = timedAbilities('omega');
    expect(omega.some((ability) => ability.kind === 'heal')).toBe(false);
    expect(new Set(omega.map((ability) => ability.kind)).size).toBeGreaterThanOrEqual(5);
    expect(ZOMBIES.omega.health).toBeGreaterThan(ZOMBIES.butcher.health);
  });

  it('announces the heavy hits with a warning ring', () => {
    for (const boss of BOSSES) {
      for (const ability of timedAbilities(boss)) {
        if (ability.kind === 'slam' && ability.radius > 300) expect(ability.telegraph).toBeTruthy();
        if (ability.kind === 'mortar') expect(ability.telegraph).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('weapon balance', () => {
  it('lists eleven weapons ordered by price', () => {
    expect(WEAPON_ORDER).toHaveLength(11);
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

  it('lets the frost cannon brake instead of burn', () => {
    expect(WEAPONS.cryo.slow).toBeGreaterThan(0);
    expect(WEAPONS.cryo.slow).toBeLessThan(1);
    expect(WEAPONS.cryo.slowSeconds!).toBeGreaterThan(1);
    expect(WEAPONS.cryo.burn).toBeUndefined();
    // It buys the slow with damage: the pure damage dealers still hit harder.
    expect(dps('cryo')).toBeLessThan(dps('laser'));
    expect(WEAPONS.cryo.pierce).toBeGreaterThan(0);
  });
});

describe('defenses', () => {
  it('offers four barricades and six turrets', () => {
    expect(BARRICADE_ORDER).toHaveLength(4);
    expect(TURRET_ORDER).toHaveLength(6);
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
    for (let index = 1; index < TURRET_ORDER.length; index += 1) {
      expect(DEFENSES[TURRET_ORDER[index]].cost).toBeGreaterThan(
        DEFENSES[TURRET_ORDER[index - 1]].cost,
      );
    }
  });

  it('gives the new turrets their own trick', () => {
    expect(DEFENSES.flame.burn).toBeGreaterThan(0);
    expect(DEFENSES.flame.range!).toBeLessThan(DEFENSES.mg.range!);
    expect(DEFENSES.tesla.chain).toBe(3);
    expect(DEFENSES.laser.pierce!).toBeGreaterThan(DEFENSES.marksman.pierce!);
    expect(DEFENSES.laser.range!).toBeGreaterThan(DEFENSES.tesla.range!);
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

  it('allows defenses directly in every map corner', () => {
    const insetX = 30 + wood.width / 2;
    const insetY = 30 + wood.height / 2;
    expect(canPlaceDefense(barricade(insetX, insetY), [], [])).toBe(true);
    expect(canPlaceDefense(barricade(ARENA.width - insetX, insetY), [], [])).toBe(true);
    expect(canPlaceDefense(barricade(insetX, ARENA.height - insetY), [], [])).toBe(true);
    expect(
      canPlaceDefense(barricade(ARENA.width - insetX, ARENA.height - insetY), [], []),
    ).toBe(true);
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
    expect(
      distanceToDefense(1000 + wood.width / 2 + DEFENSE_REACH + 1, 800, placed),
    ).toBeGreaterThan(DEFENSE_REACH);
  });

  it('prices repair by missing health', () => {
    expect(repairCost({ health: wood.health, maxHealth: wood.health })).toBe(0);
    expect(repairCost({ health: wood.health - 200, maxHealth: wood.health })).toBe(
      Math.ceil(200 * REPAIR_COST_PER_HP),
    );
  });

  it('keeps the original sell price and only deducts actual damage', () => {
    for (const type of [...BARRICADE_ORDER, ...TURRET_ORDER]) {
      const defense = DEFENSES[type];
      expect(sellValue(type, defense.health, defense.health)).toBe(defense.cost);
      expect(sellValue(type, defense.health / 2, defense.health)).toBe(
        Math.round(defense.cost / 2),
      );
      expect(sellValue(type, 0, defense.health)).toBe(0);
    }
  });

  it('discounts repairs for the engineer', () => {
    const damaged = { health: wood.health - 200, maxHealth: wood.health };
    expect(repairCost(damaged, 0.4)).toBeLessThan(repairCost(damaged));
  });
});

describe('arsenal and ammunition', () => {
  it('caps spare ammunition at one full resupply', () => {
    for (const weapon of WEAPON_ORDER) {
      expect(reserveCapacity(weapon)).toBe(WEAPONS[weapon].reserve);
      expect(reserveCapacity(weapon)).toBeGreaterThan(WEAPONS[weapon].magazine);
    }
  });

  it('grows the reserve with the upgrade', () => {
    expect(reserveCapacity('rifle', 40)).toBeGreaterThan(reserveCapacity('rifle'));
  });

  it('charges only for the rounds that are missing', () => {
    const capacity = reserveCapacity('rifle');
    const fullRefill = ammoRefillCost('rifle', 0);
    const halfRefill = ammoRefillCost('rifle', capacity / 2);
    const oneRound = ammoRefillCost('rifle', capacity - 1);

    expect(fullRefill).toBe(WEAPONS.rifle.ammoCost);
    expect(halfRefill).toBe(Math.ceil(fullRefill / 2));
    expect(oneRound).toBeGreaterThan(0);
    expect(oneRound).toBeLessThan(halfRefill);
    expect(ammoRefillCost('rifle', capacity)).toBe(0);
    expect(ammoRefillCost('pistol', 0)).toBe(0);
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

  it('keeps the dash ladder short and expensive', () => {
    expect(upgradeMaxLevel('dashCharges')).toBeLessThan(UPGRADE_MAX_LEVEL);
    expect(upgradeMaxLevel('weaponDamage')).toBe(UPGRADE_MAX_LEVEL);
  });

  it('turns the dash from a dodge into full immunity, step by step', () => {
    // Dashing alone is no longer a free pass, but it still eats a good part.
    expect(dashReduction(0)).toBeCloseTo(DASH_BASE_RESIST);
    expect(dashReduction(0)).toBeGreaterThan(0);
    expect(dashReduction(0)).toBeLessThan(1);
    // Every level is worth far more than a percent upgrade, and the last one
    // buys back the old immunity.
    expect(dashReduction(1) - dashReduction(0)).toBeCloseTo(DASH_RESIST_STEP);
    expect(DASH_RESIST_STEP).toBeGreaterThan(0.05);
    const max = upgradeMaxLevel('dashResist');
    expect(max).toBeLessThan(UPGRADE_MAX_LEVEL);
    expect(dashReduction(max - 1)).toBeLessThan(1);
    expect(dashReduction(max)).toBe(1);
    // A ladder that ends in immunity has to cost accordingly: every level is
    // far pricier than a percent level, and the whole ladder beats any perk.
    let ladder = 0;
    for (let level = 0; level < max; level += 1) {
      expect(upgradeLevelCost('dashResist', level)).toBeGreaterThan(upgradeCost(level) * 4);
      if (level > 0) {
        expect(upgradeLevelCost('dashResist', level)).toBeGreaterThan(
          upgradeLevelCost('dashResist', level - 1),
        );
      }
      ladder += upgradeLevelCost('dashResist', level);
    }
    expect(ladder).toBeGreaterThan(Math.max(...Object.values(PERK_COST)));
  });

  it('locks the dash upgrades that need a perk first', () => {
    const none = { ...EMPTY_PERKS };
    expect(upgradeUnlocked('dashShield', none)).toBe(false);
    expect(upgradeUnlocked('dashDamage', none)).toBe(false);
    // Both dash perks scale with the damage level, the shield only with blades.
    expect(upgradeUnlocked('dashDamage', { ...none, dashShock: true })).toBe(true);
    expect(upgradeUnlocked('dashShield', { ...none, dashShock: true })).toBe(false);
    expect(upgradeUnlocked('dashShield', { ...none, dashBlades: true })).toBe(true);
    // Everything without a perk behind it stays open from the start.
    expect(upgradeUnlocked('dashResist', none)).toBe(true);
    expect(upgradeUnlocked('weaponDamage', none)).toBe(true);
  });

  it('lets the dash grow into damage and a shield', () => {
    expect(upgradeMaxLevel('dashDamage')).toBe(UPGRADE_MAX_LEVEL);
    expect(upgradeMaxLevel('dashShield')).toBe(UPGRADE_MAX_LEVEL);
    expect(DASH_CUT_DAMAGE).toBeGreaterThan(0);
    expect(DASH_SHIELD_PER_HIT).toBeGreaterThan(0);
    // The shield stays a slice of the own health and never sticks around.
    expect(SHIELD_SHARE).toBeGreaterThan(0);
    expect(SHIELD_SHARE).toBeLessThan(1);
    expect(SHIELD_DECAY).toBeGreaterThan(0);
    expect(PERK_COST.dashBlades).toBeGreaterThan(0);
  });

  it('caps armour so no build becomes untouchable', () => {
    expect(armorReduction(0)).toBe(0);
    expect(armorReduction(10)).toBeCloseTo(0.1);
    expect(armorReduction(UPGRADE_MAX_LEVEL)).toBeLessThanOrEqual(0.35);
  });

  it('adds start money through a levelled upgrade', () => {
    expect(EMPTY_UPGRADES.startMoney).toBe(0);
    expect(startingMoney(0)).toBe(START_MONEY);
    expect(startingMoney(1)).toBe(START_MONEY + START_MONEY_PER_LEVEL);
    expect(startingMoney(10)).toBe(START_MONEY + 10 * START_MONEY_PER_LEVEL);
    expect(Object.keys(EMPTY_UPGRADES)).not.toContain('income');
    expect(Object.values(EMPTY_UPGRADES).every((level) => level === 0)).toBe(true);
    expect(Object.keys(EMPTY_PERKS)).not.toContain('income');
  });

  it('leaves extra dash charges to the levelled upgrade alone', () => {
    expect(Object.keys(EMPTY_PERKS)).not.toContain('extraDash');
    expect(upgradeMaxLevel('dashCharges')).toBeGreaterThan(0);
  });

  it('prices every one-time perk', () => {
    for (const key of Object.keys(EMPTY_PERKS) as PerkKey[]) {
      expect(PERK_COST[key]).toBeGreaterThan(0);
      expect(EMPTY_PERKS[key]).toBe(false);
    }
    expect(discountedCost(1000, 1)).toBe(Math.round(1000 * (1 - STARTER_DISCOUNT)));
    expect(discountedCost(1000, 0)).toBe(1000);
  });
});

describe('arena, dash and revive rules', () => {
  it('uses a world larger than the visible camera viewport', () => {
    expect(ARENA.width).toBeGreaterThan(VIEWPORT.width);
    expect(ARENA.height).toBeGreaterThan(VIEWPORT.height);
  });

  it('starts everyone with two short dashes', () => {
    expect(DASH_BASE_CHARGES).toBe(2);
    expect(DASH_SECONDS).toBeLessThan(0.5);
  });

  it('keeps automatic reviving short and proximity based', () => {
    expect(REVIVE_RADIUS).toBeGreaterThan(50);
    expect(REVIVE_SECONDS).toBeLessThanOrEqual(2);
  });
});
