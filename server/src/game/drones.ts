import { ARENA, DEFENSES, EMPTY_UPGRADES, type DefenseType } from '../../../shared/game-types.js';
import { DroneState } from '../state/game-state.js';
import type { GameWorld } from './world.js';

/** How far a waiting drone circles above its hangar. */
const IDLE_ORBIT = 44;
/** Distance a drone keeps to the enemy it is working on. */
const STANDOFF = 118;
/** Extra leash on top of the hangar's range, so a drone never flies off. */
const LEASH_SLACK = 120;
/** How fast a drone turns towards where it wants to be. */
const TURN_RATE = 7;

/**
 * The drones of a hangar. They belong to the building instead of standing on
 * their own: nothing can shoot them down, and they disappear the moment the
 * hangar is sold or torn apart.
 */
export class DroneSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number, combat: boolean) {
    this.syncHangars();
    this.world.state.drones.forEach((drone) => {
      const hangar = this.world.state.defenses.get(drone.hangarId);
      if (!hangar) return;
      const config = DEFENSES[hangar.type];
      const count = config.drones ?? 1;
      const speed = config.droneSpeed ?? 220;
      const shootRange = config.droneRange ?? 280;
      const acquisitionRange = hangar.range || config.range || 600;
      const leash = acquisitionRange + LEASH_SLACK;

      drone.cooldown = Math.max(0, drone.cooldown - delta);
      drone.phase += delta * 1.5;
      const angle = drone.phase + (Math.PI * 2 * drone.slot) / count;

      // Each drone takes its own enemy where it can, so three of them never
      // pile onto the same zombie while the rest of the horde walks past.
      const targets = combat
        ? this.world.nearestTurretTargets(hangar.x, hangar.y, acquisitionRange, count, false)
        : [];
      const target = targets.length > 0 ? targets[drone.slot % targets.length] : undefined;
      const goalX = (target?.x ?? hangar.x) + Math.cos(angle) * (target ? STANDOFF : IDLE_ORBIT);
      const goalY = (target?.y ?? hangar.y) + Math.sin(angle) * (target ? STANDOFF : IDLE_ORBIT);

      const dx = goalX - drone.x;
      const dy = goalY - drone.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        const step = Math.min(distance, speed * delta);
        drone.x += (dx / distance) * step;
        drone.y += (dy / distance) * step;
      }
      this.holdLeash(drone, hangar.x, hangar.y, leash);
      drone.x = this.world.clamp(drone.x, 8, ARENA.width - 8);
      drone.y = this.world.clamp(drone.y, 8, ARENA.height - 8);

      const facing = target
        ? Math.atan2(target.y - drone.y, target.x - drone.x)
        : Math.atan2(dy, dx);
      drone.rotation = this.turnTowards(drone.rotation, facing, TURN_RATE * delta);

      if (!target || drone.cooldown > 0) return;
      if (Math.hypot(target.x - drone.x, target.y - drone.y) > shootRange) return;
      this.fire(drone, hangar.ownerId, hangar.type, facing);
    });
  }

  /** Everything a hangar owes gets launched, everything orphaned is dropped. */
  private syncHangars() {
    const wanted = new Map<string, number>();
    this.world.state.defenses.forEach((defense) => {
      const count = DEFENSES[defense.type].drones ?? 0;
      if (count > 0) wanted.set(defense.id, count);
    });

    const taken = new Map<string, Set<number>>();
    const orphans: string[] = [];
    this.world.state.drones.forEach((drone, id) => {
      const count = wanted.get(drone.hangarId) ?? 0;
      const slots = taken.get(drone.hangarId) ?? new Set<number>();
      if (drone.slot >= count || slots.has(drone.slot)) {
        orphans.push(id);
        return;
      }
      slots.add(drone.slot);
      taken.set(drone.hangarId, slots);
    });
    for (const id of orphans) this.world.state.drones.delete(id);

    for (const [hangarId, count] of wanted) {
      const slots = taken.get(hangarId);
      for (let slot = 0; slot < count; slot += 1) {
        if (!slots?.has(slot)) this.launch(hangarId, slot);
      }
    }
  }

  private launch(hangarId: string, slot: number) {
    const hangar = this.world.state.defenses.get(hangarId);
    if (!hangar) return;
    const count = DEFENSES[hangar.type].drones ?? 1;
    const angle = (Math.PI * 2 * slot) / count;
    const drone = new DroneState();
    drone.id = this.world.nextId('k');
    drone.ownerId = hangar.ownerId;
    drone.hangarId = hangarId;
    drone.slot = slot;
    drone.phase = angle;
    drone.x = hangar.x + Math.cos(angle) * IDLE_ORBIT;
    drone.y = hangar.y + Math.sin(angle) * IDLE_ORBIT;
    drone.rotation = angle;
    this.world.state.drones.set(drone.id, drone);
  }

  private fire(drone: DroneState, ownerId: string, type: DefenseType, aim: number) {
    const config = DEFENSES[type];
    const upgrades = this.world.runtime.get(ownerId)?.upgrades ?? EMPTY_UPGRADES;
    const bonus = 1 + upgrades.turretDamage * 0.02;
    const speed = config.speed ?? 900;
    const range = config.droneRange ?? 280;
    const projectile = this.world.createProjectile(
      ownerId,
      drone.x + Math.cos(aim) * 12,
      drone.y + Math.sin(aim) * 12,
      aim,
      (config.damage ?? 10) * bonus,
      speed,
      `turret_${type}`,
    );
    projectile.pierce = config.pierce ?? 0;
    projectile.life = range / speed;
    drone.cooldown = config.fireDelay ?? 0.8;
    this.world.pushFx({ k: 'muzzle', x: drone.x, y: drone.y, a: aim, s: 'drone' });
  }

  /** A drone stays tied to its hangar, no matter how far the target runs. */
  private holdLeash(drone: DroneState, x: number, y: number, leash: number) {
    const dx = drone.x - x;
    const dy = drone.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance <= leash || distance === 0) return;
    drone.x = x + (dx / distance) * leash;
    drone.y = y + (dy / distance) * leash;
  }

  private turnTowards(current: number, target: number, step: number) {
    let difference = target - current;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return current + Math.max(-step, Math.min(step, difference));
  }
}
