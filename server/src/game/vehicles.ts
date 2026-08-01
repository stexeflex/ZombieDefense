import {
  ARENA,
  DEFENSES,
  VEHICLES,
  VEHICLE_RAM_COOLDOWN,
  VEHICLE_RAM_MIN_SPEED,
  VEHICLE_RAM_SELF,
  VEHICLE_REACH,
  circleOverlapsVehicle,
  distanceToVehicle,
  driveVehicle,
  pushOutOfVehicle,
  reserveCapacity,
  vehicleGunDamage,
  vehicleRamDamage,
  vehicleSellValue,
  vehicleTopSpeed,
  vehicleWheels,
  type VehicleConfig,
} from '../../../shared/game-types.js';
import type { DefenseState, PlayerState, VehicleState, ZombieState } from '../state/game-state.js';
import type { GameWorld } from './world.js';

/**
 * Everything a hull does: driving, running enemies over, its mounted gun and
 * the workshop or medical gear some of them carry. Getting in and out lives
 * here too, so a vehicle is the only place that touches `player.vehicleId`.
 */
export class VehicleSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number, combat: boolean) {
    this.world.state.vehicles.forEach((vehicle) => {
      const config = VEHICLES[vehicle.type];
      vehicle.cooldown = Math.max(0, vehicle.cooldown - delta);
      for (const [id, timer] of vehicle.ramCooldowns) {
        if (timer <= delta) vehicle.ramCooldowns.delete(id);
        else vehicle.ramCooldowns.set(id, timer - delta);
      }

      const speed = this.drive(vehicle, config, delta);
      this.carryCrew(vehicle);
      if (!combat) return;
      this.ram(vehicle, speed);
      this.fireGun(vehicle, config);
      this.applyAuras(vehicle, config, delta);
    });
  }

  // ------------------------------------------------------------------ driving

  private drive(vehicle: VehicleState, config: VehicleConfig, delta: number) {
    const driver = this.driverOf(vehicle);
    const runtime = driver ? this.world.runtime.get(driver.id) : undefined;
    let dirX = 0;
    let dirY = 0;
    if (driver?.alive && runtime) {
      dirX = Number(runtime.input.right) - Number(runtime.input.left);
      dirY = Number(runtime.input.down) - Number(runtime.input.up);
    }

    const upgrades = driver ? this.world.upgradesOf(driver.id) : undefined;
    let topSpeed = vehicleTopSpeed(vehicle.type, upgrades?.vehicleSpeed ?? 0);
    // The nitro of a light vehicle spends a dash charge, so the burst of pace
    // stays as rare as the dodge it replaces.
    if (vehicle.boost > 0) {
      vehicle.boost = Math.max(0, vehicle.boost - delta);
      topSpeed += config.boost ?? 0;
    }

    const speed = driveVehicle(vehicle, dirX, dirY, config, delta, topSpeed);
    this.resolveCollisions(vehicle, config);
    return speed;
  }

  /**
   * Walls, buildings and other hulls stop a vehicle instead of letting it clip
   * through. The hull is treated as two circles, which is close enough to a car
   * and far cheaper than turning every wall into an oriented box.
   */
  private resolveCollisions(vehicle: VehicleState, config: VehicleConfig) {
    const cos = Math.abs(Math.cos(vehicle.rotation));
    const sin = Math.abs(Math.sin(vehicle.rotation));
    const extentX = (config.width / 2) * cos + (config.height / 2) * sin;
    const extentY = (config.width / 2) * sin + (config.height / 2) * cos;
    const clampedX = this.world.clamp(vehicle.x, extentX + 16, ARENA.width - extentX - 16);
    const clampedY = this.world.clamp(vehicle.y, extentY + 16, ARENA.height - extentY - 16);
    // Only the direction that ran into something loses its momentum, so a hull
    // slides along the edge instead of sticking to it.
    if (clampedX !== vehicle.x) {
      vehicle.vx = config.bounce ? -vehicle.vx * config.bounce : 0;
    }
    if (clampedY !== vehicle.y) {
      vehicle.vy = config.bounce ? -vehicle.vy * config.bounce : 0;
    }
    vehicle.x = clampedX;
    vehicle.y = clampedY;

    const wheels = vehicleWheels(vehicle);
    let shiftX = 0;
    let shiftY = 0;
    for (const point of wheels.points) {
      const x = point.x + shiftX;
      const y = point.y + shiftY;
      const corrected = this.pushWheel(vehicle, x, y, wheels.radius);
      shiftX += corrected.x - x;
      shiftY += corrected.y - y;
    }

    const push = Math.hypot(shiftX, shiftY);
    if (push < 0.01) return;
    vehicle.x += shiftX;
    vehicle.y += shiftY;
    // Same idea for walls and buildings: the part of the momentum that pressed
    // into the obstacle is gone, what runs alongside it stays.
    const normalX = shiftX / push;
    const normalY = shiftY / push;
    const into = vehicle.vx * normalX + vehicle.vy * normalY;
    if (into < 0) {
      const reflection = config.bounce ? 1 + config.bounce : 1;
      vehicle.vx -= normalX * into * reflection;
      vehicle.vy -= normalY * into * reflection;
      if (config.bounce) {
        this.world.pushFx({ k: 'engine', x: vehicle.x, y: vehicle.y, s: vehicle.type });
      }
    }
  }

  private pushWheel(vehicle: VehicleState, x: number, y: number, radius: number) {
    let point = { x, y };
    for (const rect of this.world.map.obstacles) {
      if (!this.world.circleOverlapsRect(point.x, point.y, radius, rect)) continue;
      const closestX = this.world.clamp(point.x, rect.x - rect.w / 2, rect.x + rect.w / 2);
      const closestY = this.world.clamp(point.y, rect.y - rect.h / 2, rect.y + rect.h / 2);
      let offsetX = point.x - closestX;
      let offsetY = point.y - closestY;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance === 0) {
        const pushX = rect.w / 2 + radius - Math.abs(point.x - rect.x);
        const pushY = rect.h / 2 + radius - Math.abs(point.y - rect.y);
        if (pushX < pushY) point = { x: point.x + (point.x < rect.x ? -pushX : pushX), y: point.y };
        else point = { x: point.x, y: point.y + (point.y < rect.y ? -pushY : pushY) };
        continue;
      }
      offsetX /= distance;
      offsetY /= distance;
      point = {
        x: point.x + offsetX * (radius - distance),
        y: point.y + offsetY * (radius - distance),
      };
    }

    this.world.state.defenses.forEach((defense) => {
      if (DEFENSES[defense.type].passable) return;
      if (!this.world.circleOverlapsDefense(point.x, point.y, radius, defense)) return;
      point = this.pushOutOfDefense(point.x, point.y, radius, defense);
    });

    this.world.state.vehicles.forEach((other) => {
      if (other.id === vehicle.id) return;
      if (!circleOverlapsVehicle(point.x, point.y, radius, other)) return;
      point = pushOutOfVehicle(point.x, point.y, radius, other);
    });
    return point;
  }

  /** Same rotated-box push-out the player uses, but for a wheel of a hull. */
  private pushOutOfDefense(x: number, y: number, radius: number, defense: DefenseState) {
    const config = DEFENSES[defense.type];
    const cos = Math.cos(-defense.rotation);
    const sin = Math.sin(-defense.rotation);
    const dx = x - defense.x;
    const dy = y - defense.y;
    let localX = dx * cos - dy * sin;
    let localY = dx * sin + dy * cos;
    const halfWidth = config.width / 2;
    const halfHeight = config.height / 2;
    const closestX = this.world.clamp(localX, -halfWidth, halfWidth);
    const closestY = this.world.clamp(localY, -halfHeight, halfHeight);
    const offsetX = localX - closestX;
    const offsetY = localY - closestY;
    const distance = Math.hypot(offsetX, offsetY);
    if (distance === 0) {
      const pushX = halfWidth + radius - Math.abs(localX);
      const pushY = halfHeight + radius - Math.abs(localY);
      if (pushX < pushY) localX += localX < 0 ? -pushX : pushX;
      else localY += localY < 0 ? -pushY : pushY;
    } else if (distance < radius) {
      localX += (offsetX / distance) * (radius - distance);
      localY += (offsetY / distance) * (radius - distance);
    } else {
      return { x, y };
    }
    const worldCos = Math.cos(defense.rotation);
    const worldSin = Math.sin(defense.rotation);
    return {
      x: defense.x + localX * worldCos - localY * worldSin,
      y: defense.y + localX * worldSin + localY * worldCos,
    };
  }

  /** Everyone on board rides along, so every other system sees them at the hull. */
  private carryCrew(vehicle: VehicleState) {
    for (const id of vehicle.crew) {
      const passenger = this.world.state.players.get(id);
      if (!passenger) continue;
      passenger.x = vehicle.x;
      passenger.y = vehicle.y;
    }
  }

  // --------------------------------------------------------------------- ram

  private ram(vehicle: VehicleState, speed: number) {
    const config = VEHICLES[vehicle.type];
    const driver = this.driverOf(vehicle);
    const upgrades = this.world.upgradesOf(driver?.id ?? '');
    const topSpeed = vehicleTopSpeed(vehicle.type, upgrades.vehicleSpeed);
    const share = topSpeed > 0 ? speed / topSpeed : 0;
    if (share < VEHICLE_RAM_MIN_SPEED) return;

    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      if (vehicle.ramCooldowns.has(id)) return;
      if (!circleOverlapsVehicle(zombie.x, zombie.y, zombie.radius, vehicle)) return;
      if (config.frontRamOnly) {
        const ahead =
          (zombie.x - vehicle.x) * Math.cos(vehicle.rotation) +
          (zombie.y - vehicle.y) * Math.sin(vehicle.rotation);
        if (ahead < config.width * 0.24) return;
      }
      victims.push([id, zombie]);
    });
    if (victims.length === 0) return;

    const damage = vehicleRamDamage(vehicle.type, upgrades.vehicleRam) * share;
    const angle = config.frontRamOnly ? vehicle.rotation : Math.atan2(vehicle.vy, vehicle.vx);
    const push = config.ramPush ?? 34;
    for (const [id, zombie] of victims) {
      vehicle.ramCooldowns.set(id, VEHICLE_RAM_COOLDOWN);
      zombie.x = this.world.clamp(zombie.x + Math.cos(angle) * push, 12, ARENA.width - 12);
      zombie.y = this.world.clamp(zombie.y + Math.sin(angle) * push, 12, ARENA.height - 12);
      this.world.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: 'ram' });
      this.world.damageZombie(id, zombie, damage, driver?.id ?? '');
      // Bodywork pays for every body: grinding through a horde wears the hull
      // down, so a vehicle never replaces a wall of turrets.
      this.world.damageVehicle(vehicle, damage * VEHICLE_RAM_SELF);
    }
  }

  // --------------------------------------------------------------------- gun

  private fireGun(vehicle: VehicleState, config: VehicleConfig) {
    const gun = config.gun;
    // A mounted gun needs somebody behind it, so a parked hull stays a wall.
    if (!gun || vehicle.crew.length === 0 || vehicle.cooldown > 0) return;
    const driver = this.driverOf(vehicle);
    const upgrades = this.world.upgradesOf(driver?.id ?? '');
    const target = this.world.nearestZombie(vehicle.x, vehicle.y, gun.range, true);
    if (!target) return;

    const aim = Math.atan2(target.y - vehicle.y, target.x - vehicle.x);
    const muzzle = config.width / 2;
    const projectile = this.world.createProjectile(
      driver?.id ?? vehicle.ownerId,
      vehicle.x + Math.cos(aim) * muzzle,
      vehicle.y + Math.sin(aim) * muzzle,
      aim,
      vehicleGunDamage(gun.damage, upgrades.vehicleGun),
      gun.speed,
      `vehicle_${vehicle.type}`,
    );
    projectile.pierce = gun.pierce;
    projectile.life = gun.range / gun.speed;
    projectile.burn = gun.burn ?? 0;
    projectile.burnSeconds = gun.burnSeconds ?? 0;
    if (gun.splashRadius) {
      projectile.splashRadius = gun.splashRadius;
      projectile.splashDamage = vehicleGunDamage(gun.splashDamage ?? 0, upgrades.vehicleGun);
      projectile.radius = 7;
    }
    this.world.pushFx({
      k: 'muzzle',
      x: vehicle.x + Math.cos(aim) * muzzle,
      y: vehicle.y + Math.sin(aim) * muzzle,
      a: aim,
      s: vehicle.type,
    });
    vehicle.cooldown = gun.fireDelay;
  }

  // ------------------------------------------------------------------- auras

  private applyAuras(vehicle: VehicleState, config: VehicleConfig, delta: number) {
    if (vehicle.crew.length === 0) return;

    if (config.heal) {
      for (const id of vehicle.crew) {
        const passenger = this.world.state.players.get(id);
        if (!passenger?.alive || passenger.health >= passenger.maxHealth) continue;
        passenger.health = Math.min(passenger.maxHealth, passenger.health + config.heal * delta);
      }
    }

    if (config.resupply) {
      // Rounds only exist whole, so the fraction is carried over to the next tick.
      vehicle.resupplyRest += config.resupply * delta;
      const rounds = Math.floor(vehicle.resupplyRest);
      if (rounds > 0) {
        vehicle.resupplyRest -= rounds;
        for (const id of vehicle.crew) {
          const passenger = this.world.state.players.get(id);
          if (!passenger || passenger.weapon === 'pistol') continue;
          const capacity = reserveCapacity(passenger.weapon, this.world.upgradesOf(id).reserveAmmo);
          passenger.reserveAmmo = Math.min(capacity, passenger.reserveAmmo + rounds);
        }
      }
    }

    if (config.repair) {
      const range = config.repairRange ?? 240;
      const amount = config.repair * delta;
      this.world.state.defenses.forEach((defense) => {
        if (defense.health >= defense.maxHealth) return;
        if (Math.hypot(defense.x - vehicle.x, defense.y - vehicle.y) > range) return;
        defense.health = Math.min(defense.maxHealth, defense.health + amount);
      });
      this.world.state.vehicles.forEach((other) => {
        if (other.id === vehicle.id || other.health >= other.maxHealth) return;
        if (Math.hypot(other.x - vehicle.x, other.y - vehicle.y) > range) return;
        other.health = Math.min(other.maxHealth, other.health + amount);
        other.refund = vehicleSellValue(other.type, other.health, other.maxHealth);
      });
    }
  }

  // ---------------------------------------------------------- getting in, out

  driverOf(vehicle: VehicleState) {
    const id = vehicle.crew[0];
    return id ? this.world.state.players.get(id) : undefined;
  }

  /** One key does both, so nobody has to remember two of them. */
  toggle(sessionId: string) {
    const player = this.world.state.players.get(sessionId);
    const phase = this.world.state.phase;
    if (!player || !player.alive || (phase !== 'build' && phase !== 'combat')) return;
    if (player.vehicleId) {
      this.leave(sessionId);
      return;
    }
    const target = this.nearestFree(player);
    if (!target) return;
    player.vehicleId = target.id;
    target.crew.push(sessionId);
    this.world.pushFx({ k: 'engine', x: target.x, y: target.y, s: target.type });
  }

  private nearestFree(player: PlayerState) {
    let best: VehicleState | undefined;
    let bestDistance = VEHICLE_REACH;
    this.world.state.vehicles.forEach((vehicle) => {
      if (vehicle.crew.length >= VEHICLES[vehicle.type].seats) return;
      const distance = distanceToVehicle(player.x, player.y, vehicle);
      if (distance > bestDistance) return;
      bestDistance = distance;
      best = vehicle;
    });
    return best;
  }

  /** Also used when a player drops out of the lobby while sitting in a seat. */
  leave(sessionId: string) {
    const player = this.world.state.players.get(sessionId);
    if (!player?.vehicleId) return;
    this.world.leaveVehicle(player);
  }
}
