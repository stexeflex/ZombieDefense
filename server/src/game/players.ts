import {
  ARENA,
  DASH_BASE_CHARGES,
  DASH_CUT_DAMAGE,
  DASH_LOCK,
  DASH_RECHARGE,
  DASH_SECONDS,
  DASH_SHIELD_PER_HIT,
  DASH_SHOCK_DAMAGE,
  DASH_SHOCK_FORCE,
  DASH_SHOCK_RADIUS,
  DASH_SPEED,
  DEFENSES,
  GRENADE_BASE_DAMAGE,
  GRENADE_BASE_RADIUS,
  MORTAR_BASE_DAMAGE,
  MORTAR_BASE_RADIUS,
  MORTAR_BASE_SLOW_SECONDS,
  MORTAR_FUSE,
  MORTAR_NAPALM_DPS,
  MORTAR_NAPALM_RADIUS_SHARE,
  MORTAR_NAPALM_SECONDS,
  MORTAR_SLOW,
  NULL_CORE_BASE_DPS,
  NULL_CORE_BASE_RADIUS,
  NULL_CORE_BASE_SECONDS,
  NULL_CORE_PULL_SPEED,
  NULL_CORE_SECONDS_PER_LEVEL,
  NULL_CORE_SLOW,
  NULL_FIELD_BASE_DPS,
  NULL_FIELD_BASE_RADIUS,
  PRECISION_BASE_DAMAGE,
  PRECISION_PROJECTILE_LIFE,
  PRECISION_PROJECTILE_RADIUS,
  PRECISION_PROJECTILE_SPEED,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  SHIELD_DECAY,
  SHIELD_SHARE,
  VEHICLES,
  VEHICLE_BOOST_SECONDS,
  WEAPONS,
  circleOverlapsVehicle,
  healthRegenPerSecond,
  isMeleeWeapon,
  magazineCapacity,
  pushOutOfVehicle,
  reserveCapacity,
  weaponLife,
  abilityMaxCharges,
  abilityRechargeTime,
  type PermanentPerks,
  type PermanentUpgrades,
  type PlayerAbilityType,
  type WeaponType,
} from '../../../shared/game-types.js';
import {
  ProjectileState,
  type DefenseState,
  type PlayerState,
  type ZombieState,
} from '../state/game-state.js';
import type { GameWorld, RuntimePlayer } from './world.js';

/**
 * How thick a shot is. Anything not listed flies as a thin bullet — the wide
 * ones are blobs, clouds and the railgun beam that visibly fills a lane.
 */
const PROJECTILE_RADIUS: Partial<Record<WeaponType, number>> = {
  rocket: 8,
  firerocket: 9,
  gravity: 14,
  nova: 7,
  acid: 7,
  flamer: 13,
  cryo: 10,
  railgun: 11,
  ionstorm: 8,
  sun: 12,
};

/** Just enough time to see where a split fragment landed before it bursts. */
const GRENADE_FRAGMENT_FUSE = 0.22;

interface PendingAbilityBlast {
  x: number;
  y: number;
  radius: number;
  damage: number;
  ownerId: string;
  fuse: number;
  source: 'grenade-mini' | 'ability_mortar';
  slow: number;
  slowSeconds: number;
  napalm: boolean;
}

/** Movement, shooting, reloading, dashing, active abilities and reviving. */
export class PlayerSystem {
  private readonly pendingAbilityBlasts: PendingAbilityBlast[] = [];

  constructor(private readonly world: GameWorld) {}

  update(delta: number) {
    const combat = this.world.state.phase === 'combat';
    if (combat) this.tickAbilityBlasts(delta);
    else this.pendingAbilityBlasts.length = 0;
    this.world.state.players.forEach((player, sessionId) => {
      const runtime = this.world.runtime.get(sessionId);
      if (!runtime) return;
      this.tickTimers(player, runtime, delta, combat);
      if (!player.alive) return;
      if (combat && player.health < player.maxHealth) {
        player.health = Math.min(
          player.maxHealth,
          player.health + healthRegenPerSecond(runtime.upgrades.healthRegen) * delta,
        );
      }
      this.move(player, runtime, delta);
      if (runtime.input.reload && player.reloading === 0) {
        this.beginReload(player, runtime.upgrades);
      }
      if (!combat) return;
      if (runtime.input.shoot && player.reloading === 0) this.shoot(player, runtime.upgrades);
      if (!isMeleeWeapon(player.weapon) && player.ammo <= 0 && player.reloading === 0) {
        if (player.reserveAmmo <= 0) this.fallBackToPistol(player, runtime);
        this.beginReload(player, runtime.upgrades);
      }
    });
  }

  // ------------------------------------------------------------------ timers

  private tickTimers(player: PlayerState, runtime: RuntimePlayer, delta: number, combat: boolean) {
    // Held fire keeps a little credit across ticks so a fast weapon holds its
    // rate. A fresh trigger press must not cash that in, or the first shot of
    // a quick weapon would come out twice at once.
    const firingNow = runtime.input.shoot && player.reloading === 0 && combat;
    const wasFiring = runtime.wasFiring;
    player.fireCooldown = Math.max(-0.1, player.fireCooldown - delta);
    if (!firingNow || !runtime.wasFiring) player.fireCooldown = Math.max(0, player.fireCooldown);
    this.tickWeaponCharge(player, runtime, delta, firingNow, wasFiring, combat);
    runtime.wasFiring = firingNow;
    player.firing = Math.max(0, player.firing - delta);
    player.hurt = Math.max(0, player.hurt - delta);
    player.dashing = Math.max(0, player.dashing - delta);
    player.weaponDashing = Math.max(0, player.weaponDashing - delta);
    if (player.weaponDashing <= 0) runtime.weaponDashHits.clear();

    // A shield is momentum, not a second health bar: it melts away on its own,
    // so it only pays off while the player keeps dashing into the horde.
    player.shieldMax = this.shieldCap(player);
    player.shield = Math.max(0, Math.min(player.shieldMax, player.shield - SHIELD_DECAY * delta));

    runtime.abilityUseLock = Math.max(0, runtime.abilityUseLock - delta);
    runtime.vehicleWreckInvulnerability = Math.max(0, runtime.vehicleWreckInvulnerability - delta);
    runtime.abilityRecharge = runtime.abilityRecharge
      .map((timer) => timer - delta)
      .sort((a, b) => a - b);
    player.ability = runtime.ability;
    const maxCharges = this.maxAbilityCharges(runtime.ability, runtime.perks);
    player.abilityMax = maxCharges;
    while (
      runtime.abilityRecharge.length > 0 &&
      runtime.abilityRecharge[0] <= 0 &&
      player.abilityCharges < maxCharges
    ) {
      runtime.abilityRecharge.shift();
      player.abilityCharges += 1;
    }
    player.abilityCharges = Math.min(player.abilityCharges, maxCharges);
    player.abilityCooldown =
      player.abilityCharges >= maxCharges || runtime.abilityRecharge.length === 0
        ? 0
        : Math.max(0, runtime.abilityRecharge[0]);

    this.tickDash(player, runtime, delta);

    if (player.reloading > 0) {
      player.reloading = Math.max(0, player.reloading - delta);
      if (player.reloading === 0) this.completeReload(player, runtime.upgrades);
    }
  }

  // -------------------------------------------------------------------- dash

  maxDashes(upgrades: PermanentUpgrades) {
    return DASH_BASE_CHARGES + upgrades.dashCharges;
  }

  private dashRechargeTime(upgrades: PermanentUpgrades) {
    return Math.max(1.2, DASH_RECHARGE / (1 + upgrades.dashRecharge * 0.02));
  }

  /** Both dash perks hit harder with the levelled upgrade behind them. */
  private dashDamage(base: number, upgrades: PermanentUpgrades) {
    return base * (1 + upgrades.dashDamage * 0.02);
  }

  private shieldCap(player: PlayerState) {
    return Math.round(player.maxHealth * SHIELD_SHARE);
  }

  private tickDash(player: PlayerState, runtime: RuntimePlayer, delta: number) {
    player.dashMax = this.maxDashes(runtime.upgrades);
    runtime.dashLock = Math.max(0, runtime.dashLock - delta);
    runtime.dashRecharge = runtime.dashRecharge.map((timer) => timer - delta).sort((a, b) => a - b);
    while (
      runtime.dashRecharge.length > 0 &&
      runtime.dashRecharge[0] <= 0 &&
      player.dashCharges < player.dashMax
    ) {
      runtime.dashRecharge.shift();
      player.dashCharges += 1;
    }
    player.dashCharges = Math.min(player.dashCharges, player.dashMax);
    player.dashCooldown =
      player.dashCharges >= player.dashMax || runtime.dashRecharge.length === 0
        ? 0
        : Math.max(0, runtime.dashRecharge[0]);

    const pressed = runtime.input.dash && !runtime.wasDashing;
    runtime.wasDashing = runtime.input.dash;
    if (!pressed || !player.alive) return;
    if (player.dashCharges <= 0 || runtime.dashLock > 0 || player.dashing > 0) return;
    // In a seat there is nothing to dodge with, so the charge goes into the
    // nitro of the vehicles that have one.
    const vehicle = this.world.vehicleOf(player.id);
    if (vehicle) {
      if (!VEHICLES[vehicle.type].boost) return;
      vehicle.boost = VEHICLE_BOOST_SECONDS;
      player.dashCharges -= 1;
      runtime.dashLock = DASH_LOCK;
      runtime.dashRecharge.push(this.dashRechargeTime(runtime.upgrades));
      this.world.pushFx({ k: 'engine', x: vehicle.x, y: vehicle.y, s: vehicle.type });
      return;
    }
    this.startDash(player, runtime);
  }

  private startDash(player: PlayerState, runtime: RuntimePlayer) {
    const input = runtime.input;
    let dx = Number(input.right) - Number(input.left);
    let dy = Number(input.down) - Number(input.up);
    if (dx === 0 && dy === 0) {
      dx = Math.cos(player.rotation);
      dy = Math.sin(player.rotation);
    }
    const length = Math.hypot(dx, dy) || 1;
    player.dashDirX = dx / length;
    player.dashDirY = dy / length;
    player.dashing = DASH_SECONDS;
    player.dashCharges -= 1;
    runtime.dashLock = DASH_LOCK;
    runtime.dashHits.clear();
    runtime.dashRecharge.push(this.dashRechargeTime(runtime.upgrades));
    this.world.pushFx({
      k: 'dash',
      x: player.x,
      y: player.y,
      a: Math.atan2(player.dashDirY, player.dashDirX),
      s: player.id,
    });

    if (runtime.perks.dashShock) {
      const victims: Array<[string, ZombieState]> = [];
      this.world.state.zombies.forEach((zombie, id) => {
        if (Math.hypot(zombie.x - player.x, zombie.y - player.y) > DASH_SHOCK_RADIUS) return;
        victims.push([id, zombie]);
      });
      this.applyDashHits(player, runtime, victims, true);
    }
  }

  /**
   * Both offensive dash perks cover the whole travelled line, not just the
   * activation point. At more than three times walking speed a point-only test
   * would otherwise jump clean over zombies between two ticks.
   */
  private hitZombiesAlongDash(
    player: PlayerState,
    runtime: RuntimePlayer,
    fromX: number,
    fromY: number,
  ) {
    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      if (runtime.dashHits.has(id)) return;
      const at = this.world.segmentCircleAt(
        fromX,
        fromY,
        player.x,
        player.y,
        zombie.x,
        zombie.y,
        zombie.radius + PLAYER_RADIUS,
      );
      if (at !== undefined) victims.push([id, zombie]);
    });
    if (victims.length === 0) return;
    this.applyDashHits(player, runtime, victims, false);
  }

  private applyDashHits(
    player: PlayerState,
    runtime: RuntimePlayer,
    victims: Array<[string, ZombieState]>,
    radialPush: boolean,
  ) {
    const shockDamage = this.dashDamage(DASH_SHOCK_DAMAGE, runtime.upgrades);
    const cutDamage = this.dashDamage(DASH_CUT_DAMAGE, runtime.upgrades);
    const shield = DASH_SHIELD_PER_HIT * (1 + runtime.upgrades.dashShield * 0.02);
    for (const [id, zombie] of victims) {
      if (runtime.dashHits.has(id)) continue;
      runtime.dashHits.add(id);
      let damage = 0;
      if (runtime.perks.dashShock) {
        const angle = radialPush
          ? Math.atan2(zombie.y - player.y, zombie.x - player.x)
          : Math.atan2(player.dashDirY, player.dashDirX);
        zombie.x = this.world.clamp(
          zombie.x + Math.cos(angle) * DASH_SHOCK_FORCE,
          12,
          ARENA.width - 12,
        );
        zombie.y = this.world.clamp(
          zombie.y + Math.sin(angle) * DASH_SHOCK_FORCE,
          12,
          ARENA.height - 12,
        );
        damage += shockDamage;
      }
      if (runtime.perks.dashBlades) {
        damage += cutDamage;
        player.shieldMax = this.shieldCap(player);
        player.shield = Math.min(player.shieldMax, player.shield + shield);
        this.world.pushFx({ k: 'shield', x: zombie.x, y: zombie.y });
      }
      this.world.damageZombie(id, zombie, damage, player.id);
    }
  }

  // ------------------------------------------------------- charged weapons

  private tickWeaponCharge(
    player: PlayerState,
    runtime: RuntimePlayer,
    delta: number,
    firingNow: boolean,
    wasFiring: boolean,
    combat: boolean,
  ) {
    const config = WEAPONS[player.weapon];
    const charge = config.charge;
    if (!charge || !combat || !player.alive || player.vehicleId) {
      runtime.weaponChargeSeconds = 0;
      runtime.chargedWeapon = '';
      player.weaponCharge = 0;
      return;
    }

    if (firingNow) {
      if (player.fireCooldown > 0 && runtime.weaponChargeSeconds <= 0) return;
      if (runtime.chargedWeapon !== player.weapon) {
        runtime.chargedWeapon = player.weapon;
        runtime.weaponChargeSeconds = 0;
      }
      runtime.weaponChargeSeconds = Math.min(
        charge.maxSeconds,
        runtime.weaponChargeSeconds + delta,
      );
      player.weaponCharge = runtime.weaponChargeSeconds / charge.maxSeconds;
      return;
    }

    if (wasFiring && runtime.chargedWeapon === player.weapon && runtime.weaponChargeSeconds > 0) {
      this.releaseChargedWeapon(player, runtime);
      return;
    }
    player.weaponCharge = 0;
  }

  private releaseChargedWeapon(player: PlayerState, runtime: RuntimePlayer) {
    const weapon = runtime.chargedWeapon;
    const config = weapon ? WEAPONS[weapon] : undefined;
    const charge = config?.charge;
    const held = runtime.weaponChargeSeconds;
    runtime.weaponChargeSeconds = 0;
    runtime.chargedWeapon = '';
    player.weaponCharge = 0;
    if (!config || !charge || player.fireCooldown > 0) return;

    const ratio = this.world.clamp(
      Math.max(charge.minSeconds, held) / Math.max(charge.maxSeconds, 0.01),
      0,
      1,
    );
    const multiplier = 1 + (charge.maxMultiplier - 1) * ratio;
    const damage = config.damage * (1 + runtime.upgrades.weaponDamage * 0.02) * multiplier;
    const aimAngle = Math.atan2(runtime.input.aimY - player.y, runtime.input.aimX - player.x);
    player.rotation = aimAngle;
    player.fireCooldown = config.fireDelay / 1000 / (1 + runtime.upgrades.meleeSpeed * 0.02);
    player.firing = Math.min(0.35, player.fireCooldown);

    if (charge.kind === 'dash') {
      const distance = 230 + ((charge.dashDistance ?? 520) - 230) * ratio;
      const duration = 0.3 + ratio * 0.34;
      player.dashDirX = Math.cos(aimAngle);
      player.dashDirY = Math.sin(aimAngle);
      player.weaponDashing = duration;
      player.dashing = Math.max(player.dashing, duration);
      runtime.weaponDashSpeed = distance / duration;
      runtime.weaponDashDamage = damage;
      runtime.weaponDashArmorPierce = config.armorPierce ?? 0;
      runtime.weaponDashHits.clear();
      this.world.pushFx({
        k: 'dash',
        x: player.x,
        y: player.y,
        a: aimAngle,
        d: duration,
        r: distance,
        s: weapon,
      });
      return;
    }

    const speed = config.speed * (0.82 + ratio * 0.18);
    const muzzleX = player.x + Math.cos(aimAngle) * 30;
    const muzzleY = player.y + Math.sin(aimAngle) * 30;
    const projectile = this.world.createProjectile(
      player.id,
      muzzleX,
      muzzleY,
      aimAngle,
      damage,
      speed,
      weapon,
    );
    projectile.pierce = config.pierce;
    projectile.life = config.range / speed;
    projectile.radius = config.projectileRadius ?? 12;
    projectile.lightningEvery = config.lightningPulse?.every ?? 0;
    projectile.lightningTimer = 0;
    projectile.lightningRange = config.lightningPulse?.range ?? 0;
    projectile.lightningDamage =
      (config.lightningPulse?.damage ?? 0) *
      (1 + runtime.upgrades.weaponDamage * 0.02) *
      multiplier;
    projectile.lightningTargets = config.lightningPulse?.targets ?? 0;
    this.world.pushFx({
      k: 'melee',
      x: player.x,
      y: player.y,
      a: aimAngle,
      r: 120,
      s: weapon,
    });
  }

  private hitZombiesAlongWeaponDash(
    player: PlayerState,
    runtime: RuntimePlayer,
    fromX: number,
    fromY: number,
  ) {
    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      if (runtime.weaponDashHits.has(id)) return;
      const at = this.world.segmentCircleAt(
        fromX,
        fromY,
        player.x,
        player.y,
        zombie.x,
        zombie.y,
        zombie.radius + PLAYER_RADIUS + 8,
      );
      if (at !== undefined) victims.push([id, zombie]);
    });
    for (const [id, zombie] of victims) {
      runtime.weaponDashHits.add(id);
      this.world.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: 'dashknife' });
      this.world.damageZombie(
        id,
        zombie,
        runtime.weaponDashDamage,
        player.id,
        runtime.weaponDashArmorPierce,
      );
    }
  }

  // ---------------------------------------------------------------- movement

  private move(player: PlayerState, runtime: RuntimePlayer, delta: number) {
    const input = runtime.input;
    // A passenger goes wherever the hull goes; only the aim stays their own.
    if (player.vehicleId) {
      player.rotation = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      return;
    }
    let dx = Number(input.right) - Number(input.left);
    let dy = Number(input.down) - Number(input.up);
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;

    let speed = PLAYER_BASE_SPEED * (1 + runtime.upgrades.moveSpeed * 0.02);
    const charged = WEAPONS[player.weapon].charge;
    if (charged && player.weaponCharge > 0) speed *= charged.moveFactor;
    const weaponDashing = player.weaponDashing > 0;
    const dashing = player.dashing > 0 && !weaponDashing;
    if (weaponDashing) {
      dx = player.dashDirX;
      dy = player.dashDirY;
      speed = runtime.weaponDashSpeed;
    } else if (dashing) {
      dx = player.dashDirX;
      dy = player.dashDirY;
      speed *= DASH_SPEED;
    }
    const fromX = player.x;
    const fromY = player.y;

    // A boss pull or shove is added on top and fades away by itself.
    const pushed = Math.hypot(runtime.pushX, runtime.pushY);
    if (pushed > 1) {
      const decay = Math.exp(-4.5 * delta);
      player.x += runtime.pushX * delta;
      player.y += runtime.pushY * delta;
      runtime.pushX *= decay;
      runtime.pushY *= decay;
    } else {
      runtime.pushX = 0;
      runtime.pushY = 0;
    }

    player.x = this.world.clamp(
      player.x + dx * speed * delta,
      ARENA.padding,
      ARENA.width - ARENA.padding,
    );
    player.y = this.world.clamp(
      player.y + dy * speed * delta,
      ARENA.padding,
      ARENA.height - ARENA.padding,
    );
    this.resolveObstacles(player);
    this.resolveDefenses(player);
    this.resolveVehicles(player);
    if (weaponDashing) this.hitZombiesAlongWeaponDash(player, runtime, fromX, fromY);
    if (dashing && (runtime.perks.dashShock || runtime.perks.dashBlades)) {
      this.hitZombiesAlongDash(player, runtime, fromX, fromY);
    }
    player.rotation = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  }

  private resolveObstacles(player: PlayerState) {
    for (const rect of this.world.map.obstacles) {
      if (!this.world.circleOverlapsRect(player.x, player.y, PLAYER_RADIUS, rect)) continue;
      const closestX = this.world.clamp(player.x, rect.x - rect.w / 2, rect.x + rect.w / 2);
      const closestY = this.world.clamp(player.y, rect.y - rect.h / 2, rect.y + rect.h / 2);
      let offsetX = player.x - closestX;
      let offsetY = player.y - closestY;
      let distance = Math.hypot(offsetX, offsetY);
      if (distance === 0) {
        const pushX = rect.w / 2 + PLAYER_RADIUS - Math.abs(player.x - rect.x);
        const pushY = rect.h / 2 + PLAYER_RADIUS - Math.abs(player.y - rect.y);
        if (pushX < pushY) player.x += (player.x < rect.x ? -1 : 1) * pushX;
        else player.y += (player.y < rect.y ? -1 : 1) * pushY;
        continue;
      }
      offsetX /= distance;
      offsetY /= distance;
      distance = PLAYER_RADIUS - distance;
      player.x += offsetX * distance;
      player.y += offsetY * distance;
    }
  }

  private resolveDefenses(player: PlayerState) {
    this.world.state.defenses.forEach((defense: DefenseState) => {
      const config = DEFENSES[defense.type];
      if (config.passable) return;
      if (config.kind === 'turret') {
        const dx = player.x - defense.x;
        const dy = player.y - defense.y;
        const distance = Math.hypot(dx, dy);
        const minimum = config.width / 2 + PLAYER_RADIUS - 4;
        if (distance > 0 && distance < minimum) {
          player.x = defense.x + (dx / distance) * minimum;
          player.y = defense.y + (dy / distance) * minimum;
        }
        return;
      }

      const cos = Math.cos(-defense.rotation);
      const sin = Math.sin(-defense.rotation);
      const dx = player.x - defense.x;
      const dy = player.y - defense.y;
      let localX = dx * cos - dy * sin;
      let localY = dx * sin + dy * cos;
      const halfWidth = config.width / 2;
      const halfHeight = config.height / 2;
      const closestX = this.world.clamp(localX, -halfWidth, halfWidth);
      const closestY = this.world.clamp(localY, -halfHeight, halfHeight);
      const offsetX = localX - closestX;
      const offsetY = localY - closestY;
      const distance = Math.hypot(offsetX, offsetY);

      if (distance > 0 && distance < PLAYER_RADIUS) {
        const push = PLAYER_RADIUS - distance;
        localX += (offsetX / distance) * push;
        localY += (offsetY / distance) * push;
      } else if (distance === 0) {
        const pushX = halfWidth + PLAYER_RADIUS - Math.abs(localX);
        const pushY = halfHeight + PLAYER_RADIUS - Math.abs(localY);
        if (pushX < pushY) localX += (localX < 0 ? -1 : 1) * pushX;
        else localY += (localY < 0 ? -1 : 1) * pushY;
      } else {
        return;
      }

      const worldCos = Math.cos(defense.rotation);
      const worldSin = Math.sin(defense.rotation);
      player.x = defense.x + localX * worldCos - localY * worldSin;
      player.y = defense.y + localX * worldSin + localY * worldCos;
    });
  }

  /** A parked hull is as solid as a wall for anybody walking past it. */
  private resolveVehicles(player: PlayerState) {
    this.world.state.vehicles.forEach((vehicle) => {
      if (!circleOverlapsVehicle(player.x, player.y, PLAYER_RADIUS, vehicle)) return;
      const freed = pushOutOfVehicle(player.x, player.y, PLAYER_RADIUS, vehicle);
      player.x = this.world.clamp(freed.x, ARENA.padding, ARENA.width - ARENA.padding);
      player.y = this.world.clamp(freed.y, ARENA.padding, ARENA.height - ARENA.padding);
    });
  }

  // ---------------------------------------------------------------- shooting

  private shoot(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    if (config.charge) return;
    if (config.throwBounces) {
      this.throwShield(player, upgrades);
      return;
    }
    if (isMeleeWeapon(player.weapon)) {
      this.swingMelee(player, upgrades);
      return;
    }
    let shots = 0;
    while (player.fireCooldown <= 0 && player.ammo > 0 && shots < 4) {
      shots += 1;
      player.ammo -= 1;
      player.fireCooldown += config.fireDelay / 1000;
      player.firing = 0.12;
      const baseDamage = config.damage * (1 + upgrades.weaponDamage * 0.02);
      const muzzleX = player.x + Math.cos(player.rotation) * 26;
      const muzzleY = player.y + Math.sin(player.rotation) * 26;
      for (let pellet = 0; pellet < config.pellets; pellet += 1) {
        const spread = (Math.random() - 0.5) * config.spread * 2;
        const projectile = this.world.createProjectile(
          player.id,
          muzzleX,
          muzzleY,
          player.rotation + spread,
          baseDamage,
          config.speed,
          player.weapon,
        );
        projectile.pierce = config.pierce;
        projectile.life = weaponLife(config);
        projectile.radius = config.projectileRadius ?? PROJECTILE_RADIUS[player.weapon] ?? 4;
        projectile.splashRadius = config.splashRadius ?? 0;
        projectile.splashDamage = (config.splashDamage ?? 0) * (1 + upgrades.weaponDamage * 0.02);
        projectile.chain = config.chain ?? 0;
        projectile.chainRange = config.chainRange ?? 0;
        projectile.burn = config.burn ?? 0;
        projectile.burnSeconds = config.burnSeconds ?? 0;
        projectile.acidRadius = config.acidRadius ?? 0;
        projectile.acidDps = (config.acidDps ?? 0) * (1 + upgrades.weaponDamage * 0.02);
        projectile.acidSeconds = config.acidSeconds ?? 0;
        projectile.slow = config.slow ?? 0;
        projectile.slowSeconds = config.slowSeconds ?? 0;
        projectile.pull = config.pull ?? 0;
        projectile.lightningEvery = config.lightningPulse?.every ?? 0;
        projectile.lightningTimer = 0;
        projectile.lightningRange = config.lightningPulse?.range ?? 0;
        projectile.lightningDamage =
          (config.lightningPulse?.damage ?? 0) * (1 + upgrades.weaponDamage * 0.02);
        projectile.lightningTargets = config.lightningPulse?.targets ?? 0;
      }
      this.world.pushFx({
        k: 'muzzle',
        x: muzzleX,
        y: muzzleY,
        a: player.rotation,
        s: player.weapon,
      });
    }
  }

  /** Ammo-free shield throw; the projectile system resolves its eight instant ricochets. */
  private throwShield(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    if (player.fireCooldown > 0) return;
    player.fireCooldown = config.fireDelay / 1000 / (1 + upgrades.meleeSpeed * 0.02);
    player.firing = Math.min(0.26, player.fireCooldown);
    const muzzleX = player.x + Math.cos(player.rotation) * 28;
    const muzzleY = player.y + Math.sin(player.rotation) * 28;
    const projectile = this.world.createProjectile(
      player.id,
      muzzleX,
      muzzleY,
      player.rotation,
      config.damage * (1 + upgrades.weaponDamage * 0.02),
      config.speed,
      player.weapon,
    );
    projectile.life = weaponLife(config);
    projectile.radius = config.projectileRadius ?? 12;
    projectile.chain = Math.max(0, (config.throwBounces ?? 1) - 1);
    projectile.chainRange = config.chainRange ?? 300;
    this.world.pushFx({
      k: 'melee',
      x: player.x,
      y: player.y,
      a: player.rotation,
      r: 100,
      s: player.weapon,
    });
  }

  /** Instant server-authoritative arc attack; melee never creates ammo or projectiles. */
  private swingMelee(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    const reach = config.range * (1 + upgrades.meleeRange * 0.01);
    const arc = config.meleeArc ?? Math.PI / 2;
    const maxTargets = config.meleeTargets ?? 1;
    let swings = 0;
    while (player.fireCooldown <= 0 && swings < 2) {
      swings += 1;
      player.fireCooldown += config.fireDelay / 1000 / (1 + upgrades.meleeSpeed * 0.02);
      player.firing = Math.max(player.firing, Math.min(0.22, config.fireDelay / 2000));
      this.world.pushFx({
        k: 'melee',
        x: player.x,
        y: player.y,
        a: player.rotation,
        r: reach,
        s: player.weapon,
      });

      const victims = [...this.world.state.zombies.entries()]
        .map(([id, zombie]) => {
          const dx = zombie.x - player.x;
          const dy = zombie.y - player.y;
          const distance = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          const difference = Math.atan2(
            Math.sin(angle - player.rotation),
            Math.cos(angle - player.rotation),
          );
          return { id, zombie, distance, difference };
        })
        .filter(
          ({ zombie, distance, difference }) =>
            distance <= reach + zombie.radius &&
            Math.abs(difference) <= arc / 2 &&
            !this.world.segmentHitsObstacle(player.x, player.y, zombie.x, zombie.y),
        )
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxTargets);

      const damage = config.damage * (1 + upgrades.weaponDamage * 0.02);
      for (const { id, zombie } of victims) {
        this.world.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: player.weapon });
        if (config.knockback) {
          zombie.x = this.world.clamp(
            zombie.x + Math.cos(player.rotation) * config.knockback,
            12,
            ARENA.width - 12,
          );
          zombie.y = this.world.clamp(
            zombie.y + Math.sin(player.rotation) * config.knockback,
            12,
            ARENA.height - 12,
          );
        }
        this.world.damageZombie(id, zombie, damage, player.id, config.armorPierce ?? 0);
      }
    }
  }

  /**
   * A dry weapon would otherwise leave a wave unfinishable, so the pistol is an
   * endless fallback.
   */
  private fallBackToPistol(player: PlayerState, runtime: RuntimePlayer) {
    if (player.weapon !== 'pistol') {
      this.equipWeapon(player, runtime, 'pistol');
      this.world.pushFx({ k: 'heal', x: player.x, y: player.y, s: 'pistol' });
    }
    player.reserveAmmo = reserveCapacity('pistol', runtime.upgrades.reserveAmmo);
  }

  /**
   * Puts the weapon in hand and parks the ammunition of the old one, so every
   * bought weapon keeps its own magazine.
   */
  equipWeapon(player: PlayerState, runtime: RuntimePlayer, weapon: WeaponType) {
    if (player.weapon === weapon) return;
    runtime.weaponChargeSeconds = 0;
    runtime.chargedWeapon = '';
    player.weaponCharge = 0;
    runtime.stowed.set(player.weapon, {
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
    });
    const stored = runtime.stowed.get(weapon);
    player.weapon = weapon;
    player.ammo = stored ? stored.ammo : this.magazineSize(weapon, runtime.upgrades);
    player.reserveAmmo = stored
      ? stored.reserveAmmo
      : reserveCapacity(weapon, runtime.upgrades.reserveAmmo);
    player.reloading = 0;
    // Swapping must not be a free burst, so the next shot waits a moment.
    player.fireCooldown = Math.max(player.fireCooldown, 0.3);
  }

  beginReload(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    if (isMeleeWeapon(player.weapon)) return;
    const magazine = this.magazineSize(player.weapon, upgrades);
    if (player.ammo >= magazine || player.reserveAmmo <= 0) return;
    player.reloading = config.reload / 1000 / (1 + upgrades.reloadSpeed * 0.02);
  }

  private completeReload(player: PlayerState, upgrades: PermanentUpgrades) {
    if (isMeleeWeapon(player.weapon)) return;
    const missing = this.magazineSize(player.weapon, upgrades) - player.ammo;
    const amount = Math.min(missing, player.reserveAmmo);
    player.ammo += amount;
    player.reserveAmmo -= amount;
  }

  magazineSize(weapon: WeaponType, upgrades: PermanentUpgrades) {
    return magazineCapacity(weapon, upgrades.magazineSize);
  }

  maxAbilityCharges(ability: PlayerAbilityType, perks: PermanentPerks) {
    return abilityMaxCharges(ability, perks);
  }

  // --------------------------------------------------------- active abilities

  hasPendingAbilityBlasts() {
    return this.pendingAbilityBlasts.length > 0;
  }

  useAbility(sessionId: string, target: { x?: number; y?: number }) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (
      !player ||
      !runtime ||
      !player.alive ||
      this.world.state.phase !== 'combat' ||
      player.abilityCharges <= 0 ||
      runtime.abilityUseLock > 0
    ) {
      return;
    }
    const targetX = Number(target.x);
    const targetY = Number(target.y);
    const x = Number.isFinite(targetX) ? this.world.clamp(targetX, 0, ARENA.width) : player.x;
    const y = Number.isFinite(targetY) ? this.world.clamp(targetY, 0, ARENA.height) : player.y;

    if (runtime.ability === 'grenade') this.throwGrenade(player, runtime, x, y);
    else if (runtime.ability === 'mortarStrike') this.callMortar(player, runtime, x, y);
    else if (runtime.ability === 'precisionShot') {
      this.firePrecisionShot(player, runtime, x, y);
    } else {
      this.placeNullCore(player, runtime, x, y);
    }

    player.abilityCharges -= 1;
    const rechargeTime = abilityRechargeTime(runtime.ability, runtime.upgrades);
    runtime.abilityRecharge.push(rechargeTime);
    runtime.abilityUseLock = 0.35;
    player.abilityCooldown = Math.min(...runtime.abilityRecharge);
  }

  private throwGrenade(player: PlayerState, runtime: RuntimePlayer, x: number, y: number) {
    const upgrades = runtime.upgrades;
    const radius = GRENADE_BASE_RADIUS * (1 + upgrades.grenadeRadius * 0.02);
    const damage = GRENADE_BASE_DAMAGE * (1 + upgrades.grenadeDamage * 0.02);

    this.abilityBlast(x, y, radius, damage, player.id, 'grenade', 0, 0);
    const fragments = Math.min(10, Math.max(0, Math.floor(upgrades.grenadeSplit)));
    if (fragments > 0) {
      const miniRadius = 48 * (1 + upgrades.grenadeRadius * 0.01);
      const spread = radius * 0.68;
      const offset = ((Math.round(x + y) % 17) / 17) * Math.PI * 2;
      for (let fragment = 0; fragment < fragments; fragment += 1) {
        const angle = offset + (fragment * Math.PI * 2) / fragments;
        const distance = fragments === 1 ? spread * 0.45 : spread * (0.55 + (fragment % 2) * 0.35);
        const fragmentX = this.world.clamp(x + Math.cos(angle) * distance, 0, ARENA.width);
        const fragmentY = this.world.clamp(y + Math.sin(angle) * distance, 0, ARENA.height);
        this.pendingAbilityBlasts.push({
          x: fragmentX,
          y: fragmentY,
          radius: miniRadius,
          damage: damage * 0.24,
          ownerId: player.id,
          fuse: GRENADE_FRAGMENT_FUSE,
          source: 'grenade-mini',
          slow: 0,
          slowSeconds: 0,
          napalm: false,
        });
        this.world.pushFx({
          k: 'warning',
          x: fragmentX,
          y: fragmentY,
          r: miniRadius,
          d: GRENADE_FRAGMENT_FUSE,
          s: 'grenade-mini',
        });
      }
    }
  }

  private callMortar(player: PlayerState, runtime: RuntimePlayer, x: number, y: number) {
    const upgrades = runtime.upgrades;
    const radius = MORTAR_BASE_RADIUS * (1 + upgrades.mortarRadius * 0.015);
    const damage = MORTAR_BASE_DAMAGE * (1 + upgrades.mortarDamage * 0.03);
    this.pendingAbilityBlasts.push({
      x,
      y,
      radius,
      damage,
      ownerId: player.id,
      fuse: MORTAR_FUSE,
      source: 'ability_mortar',
      slow: MORTAR_SLOW,
      slowSeconds: MORTAR_BASE_SLOW_SECONDS + upgrades.mortarSlow * 0.25,
      napalm: runtime.perks.mortarNapalm,
    });
    this.world.pushFx({
      k: 'warning',
      x,
      y,
      r: radius,
      d: MORTAR_FUSE,
      s: 'ability_mortar',
    });
  }

  private firePrecisionShot(
    player: PlayerState,
    runtime: RuntimePlayer,
    targetX: number,
    targetY: number,
  ) {
    const angle = Math.atan2(targetY - player.y, targetX - player.x);
    const projectile = new ProjectileState();
    projectile.id = this.world.nextId('ability');
    projectile.ownerId = player.id;
    projectile.kind = 'ability_precision';
    projectile.x = player.x + Math.cos(angle) * (PLAYER_RADIUS + 12);
    projectile.y = player.y + Math.sin(angle) * (PLAYER_RADIUS + 12);
    projectile.vx = Math.cos(angle) * PRECISION_PROJECTILE_SPEED;
    projectile.vy = Math.sin(angle) * PRECISION_PROJECTILE_SPEED;
    projectile.damage = PRECISION_BASE_DAMAGE * (1 + runtime.upgrades.precisionDamage * 0.03);
    projectile.radius = PRECISION_PROJECTILE_RADIUS + runtime.upgrades.precisionWidth;
    projectile.life = PRECISION_PROJECTILE_LIFE;
    projectile.pierce = 0;
    projectile.execute = runtime.upgrades.precisionExecute * 0.03;
    projectile.precisionHealthDamageLevel = runtime.upgrades.precisionHealthDamage;
    projectile.reduceAbilityCooldownOnKill = runtime.perks.precisionReload;
    this.world.state.projectiles.set(projectile.id, projectile);
    this.world.pushFx({
      k: 'muzzle',
      x: projectile.x,
      y: projectile.y,
      a: angle,
      s: 'ability_precision',
    });
  }

  private placeNullCore(player: PlayerState, runtime: RuntimePlayer, x: number, y: number) {
    const upgrades = runtime.upgrades;
    const damageScale = 1 + upgrades.nullCoreDamage * 0.03;
    const duration =
      NULL_CORE_BASE_SECONDS + upgrades.nullCoreDuration * NULL_CORE_SECONDS_PER_LEVEL;
    const gravity = runtime.perks.nullCoreGravity;

    this.world.spawnHazard({
      kind: 'nullField',
      x,
      y,
      r: NULL_FIELD_BASE_RADIUS * (1 + upgrades.nullFieldRadius * 0.015),
      life: duration,
      damage: NULL_FIELD_BASE_DPS * damageScale,
      ownerId: player.id,
      slow: gravity ? NULL_CORE_SLOW : 0,
      pull: gravity ? NULL_CORE_PULL_SPEED : 0,
    });
    this.world.spawnHazard({
      kind: 'nullCore',
      x,
      y,
      r: NULL_CORE_BASE_RADIUS * (1 + upgrades.nullCoreRadius * 0.015),
      life: duration,
      damage: NULL_CORE_BASE_DPS * damageScale,
      ownerId: player.id,
    });
    this.world.pushFx({ k: 'explosion', x, y, r: NULL_CORE_BASE_RADIUS, s: 'ability_null_core' });
  }

  private tickAbilityBlasts(delta: number) {
    for (let index = this.pendingAbilityBlasts.length - 1; index >= 0; index -= 1) {
      const blast = this.pendingAbilityBlasts[index];
      blast.fuse -= delta;
      if (blast.fuse > 0) continue;
      this.pendingAbilityBlasts.splice(index, 1);
      this.abilityBlast(
        blast.x,
        blast.y,
        blast.radius,
        blast.damage,
        blast.ownerId,
        blast.source,
        blast.slow,
        blast.slowSeconds,
      );
      if (blast.napalm) {
        this.world.spawnHazard({
          kind: 'napalm',
          x: blast.x,
          y: blast.y,
          r: blast.radius * MORTAR_NAPALM_RADIUS_SHARE,
          life: MORTAR_NAPALM_SECONDS,
          damage: MORTAR_NAPALM_DPS,
          ownerId: blast.ownerId,
        });
      }
    }
  }

  private abilityBlast(
    x: number,
    y: number,
    radius: number,
    damage: number,
    ownerId: string,
    source: 'grenade' | 'grenade-mini' | 'ability_mortar',
    slow: number,
    slowSeconds: number,
  ) {
    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      if (Math.hypot(zombie.x - x, zombie.y - y) <= radius + zombie.radius) {
        victims.push([id, zombie]);
      }
    });
    for (const [id, zombie] of victims) {
      if (slow > 0) this.world.chillZombie(zombie, slow, slowSeconds);
      this.world.damageZombie(id, zombie, damage, ownerId);
    }
    this.world.pushFx({ k: 'explosion', x, y, r: radius, s: source });
  }

  // ----------------------------------------------------------------- revives

  updateRevives(delta: number) {
    this.world.state.players.forEach((downed) => {
      if (downed.alive) return;
      const rescuer = [...this.world.state.players.values()].find(
        (player) =>
          player.id !== downed.id &&
          player.alive &&
          Math.hypot(player.x - downed.x, player.y - downed.y) <= REVIVE_RADIUS,
      );
      const helper = rescuer ? this.world.runtime.get(rescuer.id) : undefined;
      const speed = helper?.perks.fieldMedic ? 2 : 1;
      downed.reviveProgress = rescuer
        ? Math.min(1, downed.reviveProgress + (delta * speed) / REVIVE_SECONDS)
        : Math.max(0, downed.reviveProgress - delta * 1.25);
      if (downed.reviveProgress >= 1) {
        downed.alive = true;
        downed.health = Math.ceil(downed.maxHealth * (helper?.perks.fieldMedic ? 0.7 : 0.4));
        downed.reviveProgress = 0;
        this.world.pushFx({ k: 'heal', x: downed.x, y: downed.y });
      }
    });
  }
}
