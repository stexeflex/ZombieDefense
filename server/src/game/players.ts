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
  GRENADE_BASE_COOLDOWN,
  GRENADE_BASE_DAMAGE,
  GRENADE_BASE_RADIUS,
  GRENADE_MIN_COOLDOWN,
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
  type PermanentPerks,
  type PermanentUpgrades,
  type WeaponType,
} from '../../../shared/game-types.js';
import type { DefenseState, PlayerState, ZombieState } from '../state/game-state.js';
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

/** Movement, shooting, reloading, dashing, grenades and picking each other up. */
export class PlayerSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number) {
    const combat = this.world.state.phase === 'combat';
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
    player.fireCooldown = Math.max(-0.1, player.fireCooldown - delta);
    if (!firingNow || !runtime.wasFiring) player.fireCooldown = Math.max(0, player.fireCooldown);
    runtime.wasFiring = firingNow;
    player.firing = Math.max(0, player.firing - delta);
    player.hurt = Math.max(0, player.hurt - delta);
    player.dashing = Math.max(0, player.dashing - delta);

    // A shield is momentum, not a second health bar: it melts away on its own,
    // so it only pays off while the player keeps dashing into the horde.
    player.shieldMax = this.shieldCap(player);
    player.shield = Math.max(0, Math.min(player.shieldMax, player.shield - SHIELD_DECAY * delta));

    runtime.grenadeThrowLock = Math.max(0, runtime.grenadeThrowLock - delta);
    runtime.grenadeRecharge = runtime.grenadeRecharge
      .map((timer) => timer - delta)
      .sort((a, b) => a - b);
    const maxGrenades = this.maxGrenades(runtime.perks);
    while (
      runtime.grenadeRecharge.length > 0 &&
      runtime.grenadeRecharge[0] <= 0 &&
      player.grenades < maxGrenades
    ) {
      runtime.grenadeRecharge.shift();
      player.grenades += 1;
    }
    player.grenadeCooldown =
      player.grenades >= maxGrenades || runtime.grenadeRecharge.length === 0
        ? 0
        : Math.max(0, runtime.grenadeRecharge[0]);

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
    const dashing = player.dashing > 0;
    if (dashing) {
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
        projectile.radius = PROJECTILE_RADIUS[player.weapon] ?? 4;
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

  maxGrenades(perks: PermanentPerks) {
    return perks.extraGrenade ? 4 : 3;
  }

  // ---------------------------------------------------------------- grenades

  throwGrenade(sessionId: string, target: { x?: number; y?: number }) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (
      !player ||
      !runtime ||
      !player.alive ||
      this.world.state.phase !== 'combat' ||
      player.grenades <= 0 ||
      runtime.grenadeThrowLock > 0
    ) {
      return;
    }
    const upgrades = runtime.upgrades;
    const targetX = Number(target.x);
    const targetY = Number(target.y);
    const x = Number.isFinite(targetX) ? this.world.clamp(targetX, 0, ARENA.width) : player.x;
    const y = Number.isFinite(targetY) ? this.world.clamp(targetY, 0, ARENA.height) : player.y;
    const radius = GRENADE_BASE_RADIUS * (1 + upgrades.grenadeRadius * 0.02);
    const damage = GRENADE_BASE_DAMAGE * (1 + upgrades.grenadeDamage * 0.02);

    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      if (Math.hypot(zombie.x - x, zombie.y - y) <= radius + zombie.radius) {
        victims.push([id, zombie]);
      }
    });
    for (const [id, zombie] of victims) this.world.damageZombie(id, zombie, damage, player.id);

    player.grenades -= 1;
    const rechargeTime = Math.max(
      GRENADE_MIN_COOLDOWN,
      GRENADE_BASE_COOLDOWN / (1 + upgrades.grenadeCooldown * 0.02),
    );
    runtime.grenadeRecharge.push(rechargeTime);
    runtime.grenadeThrowLock = 0.35;
    player.grenadeCooldown = Math.min(...runtime.grenadeRecharge);
    this.world.pushFx({ k: 'explosion', x, y, r: radius, s: 'grenade' });
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
