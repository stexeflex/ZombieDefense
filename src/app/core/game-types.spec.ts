import {
  ARENA,
  BARRICADE_ORDER,
  BOSSES,
  CAMPAIGN_REWARD_MULTIPLIER,
  DASH_BASE_CHARGES,
  DASH_BASE_RESIST,
  DASH_CUT_DAMAGE,
  DASH_RESIST_STEP,
  DASH_SECONDS,
  DASH_SHIELD_PER_HIT,
  DASH_SHOCK_DAMAGE,
  DASH_SHOCK_FORCE,
  DASH_SHOCK_RADIUS,
  DASH_SPEED,
  DEFEAT_REWARD_BONUS,
  DEFEAT_REWARD_SHARE,
  DEFENSES,
  DEFENSE_REACH,
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  HEALTH_REGEN_PER_LEVEL,
  MAPS,
  MINI_BOSSES,
  PERK_COST,
  PLAYER_ABILITIES,
  PLAYER_ABILITY_COST,
  PLAYER_ABILITY_ORDER,
  PRECISION_KILL_COOLDOWN_REDUCTION,
  PLAYER_BASE_SPEED,
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
  VEHICLES,
  VEHICLE_MAX_ARMOR_REDUCTION,
  VEHICLE_MAX_SPEED_BONUS,
  VEHICLE_ORDER,
  VEHICLE_RAM_SELF,
  VEHICLE_WRECK_DAMAGE,
  VEHICLE_SPEED_STEP,
  VIEWPORT,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  ZOMBIE_TYPES,
  ammoRefillCost,
  abilityMaxCharges,
  abilityRechargeTime,
  armorReduction,
  campaignRunReward,
  canPlaceDefense,
  canPlaceVehicle,
  canTurretTarget,
  circleOverlapsVehicle,
  dashReduction,
  defenseFootprint,
  discountedCost,
  distanceToDefense,
  distanceToVehicle,
  driveVehicle,
  endlessDamageScale,
  endlessHealthScale,
  endlessRunReward,
  endlessSpeedScale,
  endlessWave,
  healthRegenPerSecond,
  isMeleeWeapon,
  magazineCapacity,
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
  vehicleArmorReduction,
  vehicleGunDamage,
  vehicleMaxHealth,
  vehicleRamDamage,
  vehicleSellValue,
  vehicleTopSpeed,
  weaponSellValue,
  type MapObstacle,
  type PerkKey,
  type PlacedDefense,
  type PlacedVehicle,
  type VehicleMotion,
  type WeaponType,
} from '../../../shared/game-types';

function dps(weapon: WeaponType) {
  const config = WEAPONS[weapon];
  return (config.damage * config.pellets * 1000) / config.fireDelay;
}

describe('map campaign', () => {
  it('offers sixteen maps that get harder and pay out more', () => {
    expect(MAPS).toHaveLength(16);
    for (let index = 1; index < MAPS.length; index += 1) {
      expect(MAPS[index].difficulty).toBeGreaterThan(MAPS[index - 1].difficulty);
      expect(MAPS[index].reward).toBeGreaterThan(MAPS[index - 1].reward);
      if (MAPS[index].mission?.kind !== 'timed') {
        expect(MAPS[index].waves.length).toBeGreaterThanOrEqual(MAPS[index - 1].waves.length);
      }
    }
  });

  it('pays enough boss gold to fund several upgrade paths across the campaign', () => {
    expect(MAPS.reduce((total, map) => total + map.reward, 0)).toBeGreaterThanOrEqual(34_000);
  });

  it('rewards late campaign defeats without making them as valuable as a victory', () => {
    const map = MAPS[MAPS.length - 1];
    const earlyDefeat = campaignRunReward(map, 1, false);
    const lateDefeat = campaignRunReward(map, map.waves.length - 1, false);
    const bossDefeat = campaignRunReward(map, map.waves.length, false);
    const victory = campaignRunReward(map, map.waves.length, true);

    expect(lateDefeat).toBeGreaterThan(earlyDefeat);
    expect(lateDefeat).toBeGreaterThan(map.reward / 2);
    expect(bossDefeat).toBeGreaterThan(lateDefeat);
    expect(bossDefeat).toBeLessThan(victory);
  });

  it('doubles campaign payouts while retaining the defeat consolation', () => {
    for (const map of MAPS) {
      for (const wave of [1, Math.round(map.waves.length / 2), map.waves.length]) {
        const bare = (15 + wave * 12) * map.moneyScale;
        const progress = Math.min(1, wave / map.waves.length);
        const withoutBonus = bare + map.reward * DEFEAT_REWARD_SHARE * progress * progress;
        expect(campaignRunReward(map, wave, false)).toBe(
          Math.round(withoutBonus * (1 + DEFEAT_REWARD_BONUS) * CAMPAIGN_REWARD_MULTIPLIER),
        );
      }
      // Victories are doubled too; the consolation itself remains defeat-only.
      expect(campaignRunReward(map, map.waves.length, true)).toBe(
        Math.round(
          ((15 + map.waves.length * 12) * map.moneyScale + map.reward) * CAMPAIGN_REWARD_MULTIPLIER,
        ),
      );
    }
    expect(CAMPAIGN_REWARD_MULTIPLIER).toBe(2);
  });

  it('pays a meaningful survival bonus for deep endless runs', () => {
    const map = MAPS[0];
    expect(endlessRunReward(map, 10)).toBe(135);
    expect(endlessRunReward(map, 50)).toBe(1415);
    expect(endlessRunReward(map, 50)).toBeGreaterThan(endlessRunReward(map, 30) * 2);
  });

  it('ends regular maps with their own boss and timed survival with three at once', () => {
    const seen = new Set<string>();
    for (const map of MAPS) {
      const bossWaves = map.waves.filter((wave) => wave.kind === 'boss');
      expect(bossWaves).toHaveLength(1);
      expect(map.waves[map.waves.length - 1].kind).toBe('boss');
      expect(bossWaves[0].zombies).toContain(map.boss);
      expect(ZOMBIES[map.boss].rank).toBe('boss');
      if (map.mission?.kind === 'timed') {
        expect(bossWaves[0].zombies.filter((type) => ZOMBIES[type].rank === 'boss')).toHaveLength(
          3,
        );
      } else {
        expect(seen.has(map.boss)).toBe(false);
        seen.add(map.boss);
      }
    }
    expect(seen.size).toBe(BOSSES.length);
  });

  it('defines a sparse eight-minute elite survival finale', () => {
    const map = MAPS.find((entry) => entry.id === 'deadzone');
    expect(map?.mission?.kind).toBe('timed');
    if (!map || map.mission?.kind !== 'timed') throw new Error('timed map missing');
    expect(map.mission.durationSeconds).toBe(480);
    expect(map.mission.reinforcementTimes).toHaveLength(map.waves.length - 1);
    expect(map.mission.reinforcementTimes.at(-1)).toBeLessThan(map.mission.durationSeconds);
    expect(map.obstacles.length).toBeLessThanOrEqual(5);
    expect(map.waves.every((wave) => wave.zombies.length <= 18)).toBe(true);
    expect(
      map.waves
        .slice(0, -1)
        .flatMap((wave) => wave.zombies)
        .every((type) => ZOMBIES[type].rank !== 'trash'),
    ).toBe(true);
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

  it('adds directed assaults, a holdout and a real escort objective', () => {
    const relay = MAPS.find((map) => map.id === 'relay');
    const convoy = MAPS.find((map) => map.id === 'convoy');
    const lateWaves = MAPS.slice(10).flatMap((map) => map.waves);

    expect(relay?.mission?.kind).toBe('holdout');
    expect(convoy?.mission?.kind).toBe('escort');
    if (convoy?.mission?.kind === 'escort') {
      expect(convoy.mission.path.length).toBeGreaterThanOrEqual(5);
      expect(convoy.mission.maxHealth).toBeGreaterThan(5000);
    }
    expect(
      lateWaves.filter((wave) => wave.spawnPattern && wave.spawnPattern !== 'all').length,
    ).toBe(lateWaves.length);
    expect(lateWaves.some((wave) => (wave.spawnDelayScale ?? 1) < 0.35)).toBe(true);
  });

  it('makes map eight compact and map nine deliberately open', () => {
    expect(MAPS[7].mission?.title).toBe('Kompakt-Arena');
    expect(MAPS[8].mission?.title).toBe('Offenes Großfeld');
    expect(MAPS[7].obstacles.length).toBeGreaterThan(MAPS[8].obstacles.length);
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

  it('ramps endless enemies after wave 30 and accounts for bigger squads', () => {
    expect(endlessHealthScale(30, 2)).toBe(1);
    expect(endlessDamageScale(30)).toBe(1);
    expect(endlessSpeedScale(30)).toBe(1);
    expect(endlessHealthScale(40, 2)).toBeGreaterThan(endlessHealthScale(40, 1));
    expect(endlessHealthScale(50, 2)).toBeGreaterThan(endlessHealthScale(40, 2));
    expect(endlessDamageScale(50)).toBeGreaterThan(endlessDamageScale(40));
    expect(endlessSpeedScale(50)).toBeGreaterThan(endlessSpeedScale(40));
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
  it('covers trash, elites, mini bosses and every dedicated campaign boss', () => {
    expect(ZOMBIE_TYPES.length).toBeGreaterThanOrEqual(20);
    expect(ZOMBIES.exploder.explode).toBeDefined();
    expect(ZOMBIES.shieldbearer.frontShield).toBeDefined();
    expect(MINI_BOSSES.every((type) => ZOMBIES[type].rank === 'mini')).toBe(true);
    expect(BOSSES.every((type) => ZOMBIES[type].rank === 'boss')).toBe(true);
    expect(new Set(MAPS.map((map) => map.boss)).size).toBe(BOSSES.length);
  });

  it('uses shield carriers as rare isolated threats on every map', () => {
    for (const map of MAPS) {
      const carriers = map.waves
        .flatMap((wave) => wave.zombies)
        .filter((type) => type === 'shieldbearer');
      expect(carriers.length).toBeGreaterThan(0);
      expect(carriers.length).toBeLessThanOrEqual(Math.ceil(map.waves.length / 4));
    }
    expect(ZOMBIES.shieldbearer.frontShield!.turnSpeed).toBeLessThan(1);
    expect(ZOMBIES.shieldbearer.frontShield!.arc).toBeLessThan(Math.PI);
  });

  it('introduces rare Phasenwächter with a short all-round shield', () => {
    for (const map of MAPS) {
      const guards = map.waves
        .flatMap((wave) => wave.zombies)
        .filter((type) => type === 'phaseguard');
      expect(guards.length).toBeGreaterThan(0);
      expect(guards.length).toBeLessThanOrEqual(Math.ceil(map.waves.length / 5));
    }
    const shield = timedAbilities('phaseguard').find((ability) => ability.kind === 'phaseShield');
    expect(shield).toBeDefined();
    expect(shield!.duration).toBeLessThan(2);
    expect(shield!.every).toBeGreaterThan(shield!.duration * 4);
  });

  it('sprinkles rare zig-zag runners and turret-invisible phantoms across the campaign', () => {
    for (const map of MAPS) {
      const roster = map.waves.flatMap((wave) => wave.zombies);
      const evasive = roster.filter((type) => type === 'evasive');
      const phantoms = roster.filter((type) => type === 'phantom');
      expect(evasive.length).toBeGreaterThan(0);
      expect(phantoms.length).toBeGreaterThan(0);
      expect(evasive.length).toBeLessThanOrEqual(Math.ceil(map.waves.length / 3));
      expect(phantoms.length).toBeLessThanOrEqual(Math.ceil(map.waves.length / 4));
    }
    expect(ZOMBIES.evasive.zigzag?.angle).toBeGreaterThan(0.5);
    expect(ZOMBIES.evasive.speed).toBeGreaterThan(ZOMBIES.normal.speed);
    expect(canTurretTarget('phantom')).toBe(false);
    expect(canTurretTarget('normal')).toBe(true);
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
    expect(ZOMBIES.bastion.armor).toBeGreaterThan(0.4);
    expect(ZOMBIES.siren.abilities?.some((ability) => ability.kind === 'haste')).toBe(true);
    expect(splitAbility('tunneler')).toBeDefined();
    expect(
      timedAbilities('roadking').some(
        (ability) => ability.kind === 'summon' && ability.type === 'exploder',
      ),
    ).toBe(true);
    expect(
      new Set(
        timedAbilities('eclipse')
          .filter((ability) => ability.kind === 'puddle')
          .map((ability) => (ability.kind === 'puddle' ? ability.hazard : '')),
      ).size,
    ).toBe(2);
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
  it('lists twenty-six weapons ordered by price', () => {
    expect(WEAPON_ORDER).toHaveLength(26);
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
    expect(WEAPONS.nailgun.pierce).toBeGreaterThan(WEAPONS.rifle.pierce);
    expect(WEAPONS.acid.splashRadius).toBeGreaterThan(0);
    expect(WEAPONS.railgun.pierce).toBeGreaterThan(WEAPONS.laser.pierce);
    expect(WEAPONS.gravity.pull).toBeGreaterThan(0);
    expect(WEAPONS.gravity.slow).toBeGreaterThan(0);
    expect(WEAPONS.nova.pellets).toBeGreaterThan(1);
    expect(WEAPONS.nova.splashRadius).toBeGreaterThan(0);
    expect(WEAPONS.ionstorm.pellets).toBeGreaterThan(1);
    expect(WEAPONS.ionstorm.chain).toBeGreaterThan(0);
    expect(WEAPONS.sun.splashRadius).toBeGreaterThan(WEAPONS.rocket.splashRadius!);
    expect(WEAPONS.sun.burnSeconds).toBeGreaterThan(WEAPONS.firerocket.burnSeconds!);
    expect(WEAPONS.sun.cost).toBeGreaterThan(WEAPONS.ionstorm.cost);
  });

  it('offers five ammo-free melee weapons from cheap to endgame', () => {
    const melee = WEAPON_ORDER.filter(isMeleeWeapon);
    expect(melee).toEqual(['crowbar', 'fireaxe', 'chainsaw', 'phaselance', 'worldbreaker']);
    for (const weapon of melee) {
      const config = WEAPONS[weapon];
      expect(config.ammoCost).toBe(0);
      expect(config.meleeArc).toBeGreaterThan(0);
      expect(config.meleeTargets).toBeGreaterThan(0);
      expect(config.range).toBeLessThan(160);
      expect(ammoRefillCost(weapon, 0)).toBe(0);
    }
    expect(WEAPONS.worldbreaker.damage).toBeGreaterThan(WEAPONS.phaselance.damage);
    expect(WEAPONS.phaselance.armorPierce).toBeGreaterThan(WEAPONS.fireaxe.armorPierce!);
  });

  it('lets acid leave puddles instead of setting anything on fire', () => {
    expect(WEAPONS.acid.burn).toBeUndefined();
    expect(WEAPONS.acid.acidRadius!).toBeGreaterThan(WEAPONS.acid.splashRadius!);
    expect(WEAPONS.acid.acidDps!).toBeGreaterThan(0);
    expect(WEAPONS.acid.acidSeconds!).toBeGreaterThan(2);
    // The puddle carries the weapon: the burst alone is weaker than before.
    expect(WEAPONS.acid.splashDamage!).toBeLessThan(
      WEAPONS.acid.acidDps! * WEAPONS.acid.acidSeconds!,
    );
  });

  it('turns the old fire burst into its own rocket launcher', () => {
    const rocket = WEAPONS.rocket;
    const fire = WEAPONS.firerocket;
    expect(fire.cost).toBeGreaterThan(rocket.cost);
    expect(fire.splashRadius!).toBeGreaterThan(0);
    expect(fire.burn!).toBeGreaterThan(0);
    expect(fire.burnSeconds!).toBeGreaterThan(2);
    // It trades the plain rocket's burst for damage that keeps ticking.
    expect(fire.damage + fire.splashDamage!).toBeLessThan(rocket.damage + rocket.splashDamage!);
    expect(fire.acidRadius).toBeUndefined();
  });

  it('gives the magnum a hard punch that stops at the first body', () => {
    const magnum = WEAPONS.magnum;
    expect(magnum.pierce).toBe(0);
    expect(magnum.splashRadius).toBeUndefined();
    // Mid-priced, so it sits between the cheap sprayers and the endgame gear.
    expect(magnum.cost).toBeGreaterThan(WEAPONS.shotgun.cost);
    expect(magnum.cost).toBeLessThan(WEAPONS.lmg.cost);
    // Hits harder per shot and in a one-target duel, but buys no crowd damage.
    expect(magnum.damage).toBeGreaterThan(WEAPONS.nailgun.damage);
    expect(dps('magnum')).toBeGreaterThan(dps('nailgun'));
    expect(dps('magnum')).toBeLessThan(dps('lmg'));
  });

  it('gives the elephant rifle scarce ammunition and extreme single-shot damage', () => {
    const elephant = WEAPONS.elephant;
    expect(elephant.cost).toBeGreaterThan(WEAPONS.lmg.cost);
    expect(elephant.cost).toBeLessThan(WEAPONS.flamer.cost);
    expect(elephant.magazine).toBeLessThanOrEqual(2);
    expect(elephant.magazine).toBe(2);
    expect(elephant.reserve).toBe(8);
    expect(elephant.damage).toBe(850);
    expect(elephant.damage).toBeGreaterThan(WEAPONS.railgun.damage);
    expect(elephant.pierce).toBe(0);
    expect(elephant.splashRadius).toBeUndefined();
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
  it('offers twelve barricades and sixteen turrets', () => {
    expect(BARRICADE_ORDER).toHaveLength(12);
    expect(TURRET_ORDER).toHaveLength(16);
    expect(BARRICADE_ORDER.every((type) => DEFENSES[type].kind === 'barricade')).toBe(true);
    expect(TURRET_ORDER.every((type) => DEFENSES[type].kind === 'turret')).toBe(true);
  });

  it('trades barricade price for durability', () => {
    for (let index = 1; index < BARRICADE_ORDER.length; index += 1) {
      const current = DEFENSES[BARRICADE_ORDER[index]];
      const previous = DEFENSES[BARRICADE_ORDER[index - 1]];
      expect(current.cost).toBeGreaterThan(previous.cost);
      // Ground traps pay for their effect and deliberately break before a wall.
      if (
        BARRICADE_ORDER[index] !== 'wire' &&
        BARRICADE_ORDER[index] !== 'mine' &&
        BARRICADE_ORDER[index - 1] !== 'wire' &&
        BARRICADE_ORDER[index - 1] !== 'mine'
      ) {
        expect(current.health).toBeGreaterThan(previous.health);
      }
    }
  });

  it('gives both square blocks and the contact mine distinct footprints', () => {
    const woodArea = DEFENSES.wood.width * DEFENSES.wood.height;
    const smallArea = DEFENSES.crate.width * DEFENSES.crate.height;
    const largeArea = DEFENSES.block.width * DEFENSES.block.height;
    expect(DEFENSES.crate.width).toBe(DEFENSES.crate.height);
    expect(DEFENSES.block.width).toBe(DEFENSES.block.height);
    expect(smallArea).toBeCloseTo(woodArea / 2, -2);
    expect(largeArea).toBeCloseTo(woodArea * 2, -3);
    expect(DEFENSES.mine.passable).toBe(true);
    expect(DEFENSES.mine.triggerOnContact).toBe(true);
    expect(DEFENSES.mine.blastDamage).toBeGreaterThan(DEFENSES.blastwall.blastDamage!);
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
    expect(DEFENSES.frost.slow).toBeGreaterThan(0);
    expect(DEFENSES.scatter.pellets).toBeGreaterThan(1);
    expect(DEFENSES.acid.splashRadius).toBeGreaterThan(0);
    expect(DEFENSES.acid.burn).toBeUndefined();
    expect(DEFENSES.acid.acidDps!).toBeGreaterThan(0);
    expect(DEFENSES.shotgun.pellets!).toBeGreaterThan(DEFENSES.scatter.pellets!);
    expect(DEFENSES.triple.targets).toBe(3);
    expect(DEFENSES.mortar.mortarImpactSeconds).toBeGreaterThan(0.5);
    expect(DEFENSES.mortar.fireDelay!).toBeLessThan(DEFENSES.precision_mortar.fireDelay!);
    expect(DEFENSES.precision_mortar.targetTanky).toBe(true);
    expect(DEFENSES.precision_mortar.damage!).toBeGreaterThan(DEFENSES.mortar.damage! * 5);
    expect(DEFENSES.precision_mortar.armorPierce).toBeGreaterThan(0.5);
    expect(DEFENSES.plasma.cost).toBeGreaterThan(DEFENSES.laser.cost);
    expect(DEFENSES.plasma.damage! / DEFENSES.plasma.fireDelay!).toBeGreaterThan(
      (DEFENSES.laser.damage! / DEFENSES.laser.fireDelay!) * 2.5,
    );
    expect(DEFENSES.plasma.pierce!).toBeGreaterThan(DEFENSES.laser.pierce!);
    expect(DEFENSES.ring.radialShots).toBe(24);
    expect(DEFENSES.ring.fireDelay!).toBeGreaterThan(DEFENSES.launcher.fireDelay!);
    expect(DEFENSES.ring.damage!).toBeGreaterThan(DEFENSES.plasma.damage!);
  });

  it('keeps the three barrels on the tower and the drones in the hangar', () => {
    const triple = DEFENSES.triple;
    const hangar = DEFENSES.drone;
    // The tower with the three barrels shoots by itself, the hangar does not.
    expect(triple.drones).toBeUndefined();
    expect(hangar.targets).toBeUndefined();
    expect(hangar.drones!).toBeGreaterThan(1);
    expect(hangar.droneSpeed!).toBeGreaterThan(0);
    expect(hangar.droneRange!).toBeLessThan(hangar.range!);
    expect(hangar.cost).toBeGreaterThan(triple.cost);

    // The extra price buys reach and legs; raw damage stays in the same band.
    const hangarDps = (hangar.damage! * hangar.drones!) / hangar.fireDelay!;
    const tripleDps = (triple.damage! * triple.targets!) / triple.fireDelay!;
    expect(hangarDps).toBeGreaterThan(tripleDps * 0.9);
    expect(hangarDps).toBeLessThan(tripleDps * 1.15);
  });

  it('gives the triple-shot tower the buff it needed to stay worth its price', () => {
    const triple = DEFENSES.triple;
    // Beats the rocket tower it sits next to in the shop on every count.
    expect(triple.damage! * triple.targets!).toBeGreaterThan(DEFENSES.launcher.damage!);
    expect(triple.fireDelay!).toBeLessThan(DEFENSES.launcher.fireDelay!);
    expect(triple.range!).toBeGreaterThan(DEFENSES.launcher.range!);
    expect(triple.pierce!).toBeGreaterThan(0);
  });

  it('gives both new barricades a distinct last-resort role', () => {
    expect(DEFENSES.wire.passable).toBe(true);
    expect(DEFENSES.wire.slow).toBeGreaterThan(DEFENSES.stone.slow!);
    expect(DEFENSES.wire.contactDamage).toBeGreaterThan(0);
    expect(DEFENSES.wire.contactWear).toBeGreaterThanOrEqual(30);
    expect(DEFENSES.wire.health).toBeLessThan(DEFENSES.wood.health);
    expect(DEFENSES.spike.passable).toBeUndefined();
    expect(DEFENSES.spike.thorns).toBeGreaterThan(0);
    expect(DEFENSES.blastwall.blastRadius).toBeGreaterThan(0);
    expect(DEFENSES.blastwall.blastDamage).toBeGreaterThan(0);
  });

  it('gives the three premium barricades distinct control and last-stand roles', () => {
    expect(DEFENSES.shockwall.cost).toBeGreaterThan(DEFENSES.steel.cost);
    expect(DEFENSES.shockwall.thorns).toBeGreaterThan(DEFENSES.spike.thorns!);
    expect(DEFENSES.cryowall.slow).toBeGreaterThan(DEFENSES.shockwall.slow!);
    expect(DEFENSES.cryowall.health).toBeGreaterThan(DEFENSES.shockwall.health);
    expect(DEFENSES.titanwall.health).toBeGreaterThan(DEFENSES.cryowall.health);
    expect(DEFENSES.titanwall.blastDamage).toBeGreaterThan(DEFENSES.blastwall.blastDamage!);
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
    expect(canPlaceDefense(barricade(ARENA.width - insetX, ARENA.height - insetY), [], [])).toBe(
      true,
    );
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

describe('vehicles', () => {
  it('offers nine hulls ordered by price, with room for a squad', () => {
    expect(VEHICLE_ORDER).toHaveLength(9);
    for (let index = 1; index < VEHICLE_ORDER.length; index += 1) {
      expect(VEHICLES[VEHICLE_ORDER[index]].cost).toBeGreaterThan(
        VEHICLES[VEHICLE_ORDER[index - 1]].cost,
      );
    }
    for (const type of VEHICLE_ORDER) {
      expect(VEHICLES[type].seats).toBeGreaterThanOrEqual(1);
      expect(VEHICLES[type].ram).toBeGreaterThan(0);
      expect(VEHICLES[type].health).toBeGreaterThan(0);
    }
    // Driving together has to be a real option, not a single-seat gimmick.
    expect(VEHICLE_ORDER.filter((type) => VEHICLES[type].seats >= 2).length).toBeGreaterThanOrEqual(
      5,
    );
    expect(Math.max(...VEHICLE_ORDER.map((type) => VEHICLES[type].seats))).toBe(4);
  });

  it('stays a trade against walking and dashing', () => {
    for (const type of VEHICLE_ORDER) {
      // Nothing on wheels beats the burst of a dash …
      expect(VEHICLES[type].speed).toBeLessThan(PLAYER_BASE_SPEED * DASH_SPEED);
      // Only the exposed one-seat quad outruns normal movement.
      if (type !== 'quad') expect(VEHICLES[type].speed).toBeLessThan(PLAYER_BASE_SPEED);
    }
    expect(VEHICLES.quad.speed).toBeGreaterThan(PLAYER_BASE_SPEED);
    expect(VEHICLES.quad.speed).toBeGreaterThan(VEHICLES.tank.speed);
  });

  it('buys slower protected hulls with more money and durability', () => {
    expect(VEHICLES.car.cost).toBeGreaterThanOrEqual(1500);
    expect(VEHICLES.car.health).toBeGreaterThanOrEqual(1500);
    expect(VEHICLES.tank.cost).toBeGreaterThanOrEqual(8000);
    expect(VEHICLES.tank.health).toBeGreaterThanOrEqual(7000);
    expect(VEHICLE_SPEED_STEP).toBe(0.01);
    expect(vehicleTopSpeed('car', UPGRADE_MAX_LEVEL)).toBeCloseTo(
      VEHICLES.car.speed * (1 + VEHICLE_MAX_SPEED_BONUS),
    );
  });

  it('gives every vehicle one thing the others do not have', () => {
    expect(VEHICLES.quad.boost).toBeGreaterThan(0);
    expect(VEHICLES.van.heal).toBeGreaterThan(0);
    expect(VEHICLES.workshop.repair).toBeGreaterThan(0);
    expect(VEHICLES.workshop.resupply).toBeGreaterThan(0);
    expect(VEHICLES.pickup.gun).toBeDefined();
    expect(VEHICLES.apc.gun!.damage).toBeGreaterThan(VEHICLES.pickup.gun!.damage);
    expect(VEHICLES.tank.gun!.splashRadius).toBeGreaterThan(0);
    expect(VEHICLES.tank.ram).toBeGreaterThan(VEHICLES.car.ram);
    expect(VEHICLES.steamroller.ram).toBeGreaterThan(VEHICLES.tank.ram);
    expect(VEHICLES.steamroller.speed).toBeLessThan(VEHICLES.tank.speed);
    expect(VEHICLES.bulldozer.ramPush).toBeGreaterThan(90);
    expect(VEHICLES.bulldozer.frontRamOnly).toBe(true);
    expect(VEHICLES.bulldozer.directionalArmor!.exposed).toBeGreaterThan(1);
    expect(VEHICLES.bulldozer.turn).toBeLessThan(VEHICLES.tank.turn);
    for (const type of VEHICLE_ORDER) expect(VEHICLES[type].perk.length).toBeGreaterThan(0);
  });

  it('lets armour strengthen the hull while vehicles still wear down', () => {
    expect(vehicleArmorReduction(0)).toBe(0);
    expect(vehicleArmorReduction(40)).toBe(VEHICLE_MAX_ARMOR_REDUCTION);
    expect(vehicleArmorReduction(UPGRADE_MAX_LEVEL * 10)).toBe(VEHICLE_MAX_ARMOR_REDUCTION);
    expect(VEHICLE_MAX_ARMOR_REDUCTION).toBeLessThan(1);
    // Ramming and wrecks keep a vehicle from replacing a wall of turrets.
    expect(VEHICLE_RAM_SELF).toBeGreaterThan(0);
    expect(VEHICLE_WRECK_DAMAGE).toBeGreaterThan(0);
  });

  it('scales health, pace, ram and gun with their upgrades', () => {
    expect(vehicleMaxHealth('car', 0)).toBe(VEHICLES.car.health);
    expect(vehicleMaxHealth('car', 40)).toBeGreaterThan(vehicleMaxHealth('car', 0));
    expect(vehicleTopSpeed('car', 40)).toBeGreaterThan(vehicleTopSpeed('car', 0));
    expect(vehicleRamDamage('car', 40)).toBeGreaterThan(vehicleRamDamage('car', 0));
    expect(vehicleGunDamage(100, 40)).toBeGreaterThan(100);
  });

  it('keeps the original sell price and only deducts actual damage', () => {
    for (const type of VEHICLE_ORDER) {
      const health = VEHICLES[type].health;
      expect(vehicleSellValue(type, health, health)).toBe(VEHICLES[type].cost);
      expect(vehicleSellValue(type, health / 2, health)).toBe(Math.round(VEHICLES[type].cost / 2));
      expect(vehicleSellValue(type, 0, health)).toBe(0);
    }
  });

  it('needs a free parking spot and measures reach from the hull', () => {
    const car: PlacedVehicle = { type: 'car', x: 1000, y: 800, rotation: 0 };
    expect(canPlaceVehicle(car, [], [], [])).toBe(true);
    expect(canPlaceVehicle({ ...car, x: 1060 }, [], [car], [])).toBe(false);
    expect(canPlaceVehicle({ ...car, x: 1000 + VEHICLES.car.width + 4 }, [], [car], [])).toBe(true);
    const wall: MapObstacle = {
      x: 1000,
      y: 800,
      w: 80,
      h: 80,
      kind: 'wall',
      rotation: 0,
      solid: true,
    };
    expect(canPlaceVehicle(car, [], [], [wall])).toBe(false);

    expect(distanceToVehicle(1000, 800, car)).toBe(0);
    expect(distanceToVehicle(1000 + VEHICLES.car.width / 2 + 30, 800, car)).toBeCloseTo(30);
    expect(circleOverlapsVehicle(1000, 800, 10, car)).toBe(true);
    // A turned hull is checked in its own frame, not as an axis aligned box.
    const turned: PlacedVehicle = { ...car, rotation: Math.PI / 2 };
    expect(distanceToVehicle(1000, 800 + VEHICLES.car.width / 2 + 30, turned)).toBeCloseTo(30);
  });

  it('builds up speed and rolls out instead of stopping dead', () => {
    const config = VEHICLES.car;
    const motion: VehicleMotion = { x: 0, y: 0, rotation: 0, vx: 0, vy: 0 };
    const first = driveVehicle(motion, 1, 0, config, 0.05, config.speed);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(config.speed);
    for (let tick = 0; tick < 60; tick += 1) driveVehicle(motion, 1, 0, config, 0.05, config.speed);
    expect(Math.hypot(motion.vx, motion.vy)).toBeCloseTo(config.speed, 0);
    expect(motion.x).toBeGreaterThan(0);

    // Letting go coasts for a moment and then really stops.
    const rolling = driveVehicle(motion, 0, 0, config, 0.05, config.speed);
    expect(rolling).toBeLessThan(config.speed);
    expect(rolling).toBeGreaterThan(0);
    for (let tick = 0; tick < 120; tick += 1)
      driveVehicle(motion, 0, 0, config, 0.05, config.speed);
    expect(motion.vx).toBe(0);
    expect(motion.vy).toBe(0);
  });

  it('turns the hull towards the driving direction at a limited rate', () => {
    const config = VEHICLES.tank;
    const motion: VehicleMotion = { x: 0, y: 0, rotation: 0, vx: 0, vy: 0 };
    for (let tick = 0; tick < 40; tick += 1) driveVehicle(motion, 0, 1, config, 0.05, config.speed);
    expect(motion.rotation).toBeGreaterThan(0);
    expect(motion.rotation).toBeLessThanOrEqual(Math.PI / 2 + 0.001);
  });
});

describe('arsenal and ammunition', () => {
  it('caps spare ammunition at one full resupply', () => {
    for (const weapon of WEAPON_ORDER) {
      expect(reserveCapacity(weapon)).toBe(WEAPONS[weapon].reserve);
      if (isMeleeWeapon(weapon)) {
        expect(reserveCapacity(weapon)).toBe(0);
      } else {
        expect(reserveCapacity(weapon)).toBeGreaterThan(WEAPONS[weapon].magazine);
      }
    }
  });

  it('grows the reserve with the upgrade', () => {
    expect(reserveCapacity('rifle', 40)).toBeGreaterThan(reserveCapacity('rifle'));
    expect(magazineCapacity('rifle', 40)).toBeGreaterThan(magazineCapacity('rifle'));
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
    expect(ammoRefillCost('chainsaw', 0)).toBe(0);
  });

  it('deducts missing ammunition from a weapon sale', () => {
    const price = WEAPONS.rifle.cost;
    const full = weaponSellValue('rifle', magazineCapacity('rifle'), reserveCapacity('rifle'));
    const empty = weaponSellValue('rifle', 0, 0);

    expect(full).toBe(price);
    expect(empty).toBeLessThan(full);
    expect(price - empty).toBeGreaterThan(WEAPONS.rifle.ammoCost);
    expect(weaponSellValue('chainsaw', 0, 0)).toBe(WEAPONS.chainsaw.cost);
    expect(weaponSellValue('pistol', 0, 0)).toBe(0);
  });
});

describe('permanent upgrades', () => {
  it('offers three mutually exclusive G abilities with their own recharge rules', () => {
    expect(PLAYER_ABILITY_ORDER).toEqual(['grenade', 'mortarStrike', 'precisionShot']);
    expect(PLAYER_ABILITIES.mortarStrike.charges).toBe(1);
    expect(PLAYER_ABILITIES.precisionShot.charges).toBe(1);
    expect(PLAYER_ABILITIES.precisionShot.description).toContain('ohne Durchschlag');
    expect(PLAYER_ABILITY_COST.grenade).toBe(0);
    expect(PLAYER_ABILITY_COST.mortarStrike).toBe(PLAYER_ABILITY_COST.precisionShot);
    expect(PLAYER_ABILITY_COST.mortarStrike).toBeGreaterThan(0);
    expect(PRECISION_KILL_COOLDOWN_REDUCTION).toBe(0.7);
    expect(abilityMaxCharges('grenade', { ...EMPTY_PERKS, extraGrenade: true })).toBe(4);
    expect(abilityMaxCharges('mortarStrike', { ...EMPTY_PERKS, extraGrenade: true })).toBe(1);
    expect(EMPTY_PERKS.mortarNapalm).toBe(false);
    expect(EMPTY_PERKS.precisionReload).toBe(false);
    expect(PERK_COST.mortarNapalm).toBeGreaterThan(PERK_COST.extraGrenade);
    expect(PERK_COST.precisionReload).toBeGreaterThan(PERK_COST.mortarNapalm);
    expect(
      abilityRechargeTime('precisionShot', { ...EMPTY_UPGRADES, precisionCooldown: 40 }),
    ).toBeGreaterThanOrEqual(PLAYER_ABILITIES.precisionShot.minCooldown);
  });

  it('leaves room to specialise without runaway prices', () => {
    expect(UPGRADE_MAX_LEVEL).toBeGreaterThanOrEqual(40);
    for (let level = 1; level < UPGRADE_MAX_LEVEL; level += 1) {
      expect(upgradeCost(level)).toBeGreaterThan(upgradeCost(level - 1));
    }
    // A single level must stay affordable next to what a run pays out.
    expect(upgradeCost(UPGRADE_MAX_LEVEL - 1)).toBeLessThan(1000);
    // The price still rises, but more gently than the former 16-gold step.
    expect(upgradeCost(10) - upgradeCost(9)).toBe(12);
  });

  it('keeps the dash ladder short and expensive', () => {
    expect(upgradeMaxLevel('dashCharges')).toBeLessThan(UPGRADE_MAX_LEVEL);
    expect(upgradeMaxLevel('armor')).toBe(35);
    expect(upgradeMaxLevel('vehicleArmor')).toBe(35);
    expect(upgradeMaxLevel('grenadeSplit')).toBe(10);
    expect(upgradeLevelCost('grenadeSplit', 0)).toBeGreaterThan(upgradeCost(0) * 10);
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

  it('makes the shock dash a meaningful crowd shove', () => {
    expect(DASH_SHOCK_RADIUS).toBeGreaterThan(100);
    expect(DASH_SHOCK_FORCE).toBeGreaterThan(70);
    expect(DASH_SHOCK_DAMAGE).toBeGreaterThan(DASH_CUT_DAMAGE);
    expect(PERK_COST.dashShock).toBeGreaterThan(0);
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

  it('adds predictable passive health regeneration per level', () => {
    expect(EMPTY_UPGRADES.healthRegen).toBe(0);
    expect(healthRegenPerSecond(0)).toBe(0);
    expect(healthRegenPerSecond(1)).toBe(HEALTH_REGEN_PER_LEVEL);
    expect(healthRegenPerSecond(10)).toBe(10 * HEALTH_REGEN_PER_LEVEL);
  });

  it('leaves extra dash charges to the levelled upgrade alone', () => {
    expect(Object.keys(EMPTY_PERKS)).not.toContain('extraDash');
    expect(upgradeMaxLevel('dashCharges')).toBeGreaterThan(0);
  });

  it('does not keep the retired Wiederbelebung level in the shared upgrade model', () => {
    expect(Object.keys(EMPTY_UPGRADES)).not.toContain('reviveSpeed');
  });

  it('prices every one-time perk', () => {
    for (const key of Object.keys(EMPTY_PERKS) as PerkKey[]) {
      expect(PERK_COST[key]).toBeGreaterThan(0);
      expect(EMPTY_PERKS[key]).toBe(false);
    }
    expect(STARTER_DISCOUNT).toBe(0.3);
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
