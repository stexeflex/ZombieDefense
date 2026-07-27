import { ARENA } from '../../../shared/game-types.js';
import type { ProjectileState, ZombieState } from '../state/game-state.js';
import type { GameWorld } from './world.js';

/** Flying bullets, rockets, flames and lightning — from players and turrets. */
export class ProjectileSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number) {
    const expired: string[] = [];
    this.world.state.projectiles.forEach((projectile, id) => {
      projectile.life -= delta;
      const fromX = projectile.x;
      const fromY = projectile.y;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;

      // A wall stops the shot — but only what is behind it. Anything the
      // bullet passes on the way still gets hit, otherwise a fast weapon could
      // never touch an enemy standing right in front of a wall.
      const wallAt = this.world.obstacleHitAt(fromX, fromY, projectile.x, projectile.y);

      // The last step counts as well: a fast bullet fired at something in the
      // corner leaves the arena in the same tick, and dropping it before the
      // hit test would make that enemy unhittable too.
      let spent = false;
      for (const [zombieId, zombie] of this.world.state.zombies.entries()) {
        if (projectile.hitIds.has(zombieId)) continue;
        const at = this.world.segmentCircleAt(
          fromX,
          fromY,
          projectile.x,
          projectile.y,
          zombie.x,
          zombie.y,
          zombie.radius + projectile.radius,
        );
        if (at === undefined) continue;
        if (wallAt !== undefined && at > wallAt) continue;

        projectile.hitIds.add(zombieId);
        if (projectile.splashRadius > 0) {
          this.detonate(projectile, zombie.x, zombie.y);
          spent = true;
          break;
        }

        this.world.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: projectile.kind });
        if (projectile.burn > 0) {
          this.world.igniteZombie(
            zombie,
            projectile.burn,
            projectile.burnSeconds,
            projectile.ownerId,
          );
        }
        if (projectile.slow > 0) {
          this.world.chillZombie(zombie, projectile.slow, projectile.slowSeconds);
        }
        this.world.damageZombie(zombieId, zombie, projectile.damage, projectile.ownerId);

        if (projectile.chain > 0) {
          this.chainLightning(projectile, zombie, zombieId);
          spent = true;
          break;
        }
        if (projectile.pierce <= 0) {
          spent = true;
          break;
        }
        projectile.pierce -= 1;
      }

      if (spent) {
        expired.push(id);
        return;
      }
      if (wallAt !== undefined) {
        if (projectile.splashRadius > 0) this.detonate(projectile, projectile.x, projectile.y);
        else this.world.pushFx({ k: 'hit', x: projectile.x, y: projectile.y, s: 'wall' });
        expired.push(id);
        return;
      }
      if (
        projectile.life <= 0 ||
        projectile.x < 0 ||
        projectile.x > ARENA.width ||
        projectile.y < 0 ||
        projectile.y > ARENA.height
      ) {
        if (projectile.splashRadius > 0) this.detonate(projectile, projectile.x, projectile.y);
        expired.push(id);
      }
    });
    expired.forEach((id) => this.world.state.projectiles.delete(id));
  }

  private detonate(projectile: ProjectileState, x: number, y: number) {
    const radius = projectile.splashRadius;
    this.world.pushFx({ k: 'explosion', x, y, r: radius, s: projectile.kind });
    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance <= radius + zombie.radius) victims.push([id, zombie]);
    });
    for (const [id, zombie] of victims) {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      const falloff = Math.max(0.35, 1 - distance / (radius + zombie.radius));
      if (projectile.burn > 0) {
        this.world.igniteZombie(
          zombie,
          projectile.burn,
          projectile.burnSeconds,
          projectile.ownerId,
        );
      }
      if (projectile.slow > 0) {
        this.world.chillZombie(zombie, projectile.slow, projectile.slowSeconds);
      }
      this.world.damageZombie(id, zombie, projectile.splashDamage * falloff, projectile.ownerId);
    }
  }

  private chainLightning(projectile: ProjectileState, origin: ZombieState, originId: string) {
    let fromX = origin.x;
    let fromY = origin.y;
    const hit = new Set<string>([originId]);
    let damage = projectile.damage;
    for (let jump = 0; jump < projectile.chain; jump += 1) {
      damage *= 0.82;
      let bestId = '';
      let best: ZombieState | undefined;
      let bestDistance = projectile.chainRange;
      this.world.state.zombies.forEach((zombie, id) => {
        if (hit.has(id)) return;
        const distance = Math.hypot(zombie.x - fromX, zombie.y - fromY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = id;
          best = zombie;
        }
      });
      if (!best) return;
      hit.add(bestId);
      this.world.pushFx({ k: 'chain', x: fromX, y: fromY, x2: best.x, y2: best.y });
      fromX = best.x;
      fromY = best.y;
      this.world.damageZombie(bestId, best, damage, projectile.ownerId);
    }
  }
}
