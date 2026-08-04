import {
  ARENA,
  PRECISION_KILL_COOLDOWN_REDUCTION,
  ZOMBIES,
  precisionHealthDamageFraction,
} from '../../../shared/game-types.js';
import type { ProjectileState, ZombieState } from '../state/game-state.js';
import type { GameWorld } from './world.js';

/** Flying bullets, rockets, flames and lightning — from players and turrets. */
export class ProjectileSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number) {
    const expired: string[] = [];
    this.world.state.projectiles.forEach((projectile, id) => {
      if (projectile.kind === 'throwshield' && projectile.shieldLegRange > 0) {
        if (this.updateThrowShield(projectile, delta)) expired.push(id);
        return;
      }
      projectile.life -= delta;
      const fromX = projectile.x;
      const fromY = projectile.y;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      if (projectile.lightningEvery > 0) {
        projectile.lightningTimer -= delta;
        let pulses = 0;
        while (projectile.lightningTimer <= 0 && pulses < 2) {
          projectile.lightningTimer += projectile.lightningEvery;
          this.pulseLightning(projectile);
          pulses += 1;
        }
      }
      if (projectile.riftEvery > 0) {
        projectile.riftTimer -= delta;
        let pulses = 0;
        while (projectile.riftTimer <= 0 && pulses < 2) {
          projectile.riftTimer += projectile.riftEvery;
          this.pulseRift(projectile);
          pulses += 1;
        }
      }

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

        if (this.blockedByShield(projectile, zombie)) {
          const impactAngle =
            zombie.shielding > 0 ? Math.atan2(-projectile.vy, -projectile.vx) : zombie.rotation;
          const shieldX = zombie.x + Math.cos(impactAngle) * (zombie.radius + 5);
          const shieldY = zombie.y + Math.sin(impactAngle) * (zombie.radius + 5);
          this.world.pushFx({
            k: 'deflect',
            x: shieldX,
            y: shieldY,
            s: zombie.shielding > 0 ? 'phase-shield' : 'front-shield',
          });
          spent = true;
          break;
        }

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
        const missingHealth = zombie.maxHealth > 0 ? 1 - zombie.health / zombie.maxHealth : 0;
        const precisionHealthDamage =
          zombie.maxHealth *
          precisionHealthDamageFraction(
            projectile.precisionHealthDamageLevel,
            ZOMBIES[zombie.type].rank,
          );
        const damage =
          projectile.damage * (1 + projectile.execute * Math.max(0, missingHealth)) +
          precisionHealthDamage;
        this.world.damageZombie(zombieId, zombie, damage, projectile.ownerId);
        if (projectile.reduceAbilityCooldownOnKill && !this.world.state.zombies.has(zombieId)) {
          this.reducePrecisionCooldown(projectile.ownerId);
        }

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

  /**
   * The Wurfschild is deliberately not chain lightning in disguise. Each leg
   * travels through the world at the configured projectile speed, redirects
   * only after a real collision and gets the full throwing range of its own.
   */
  private updateThrowShield(projectile: ProjectileState, delta: number) {
    projectile.life -= delta;
    const owner = this.world.state.players.get(projectile.ownerId);
    if (!owner || projectile.life <= 0) return true;

    if (projectile.shieldReturning) {
      return this.returnShield(projectile, owner, delta);
    }

    let distanceLeft = projectile.shieldSpeed * delta;
    // A single server tick may contain a close target and the redirect after
    // it. Capping the loop protects pathological piles without dropping the
    // unused movement from ordinary throws.
    for (let interactions = 0; distanceLeft > 0.01 && interactions < 12; interactions += 1) {
      const legLeft = projectile.shieldLegRange - projectile.shieldLegDistance;
      if (legLeft <= 0.01) {
        this.startShieldReturn(projectile);
        return false;
      }

      const speed = Math.hypot(projectile.vx, projectile.vy) || projectile.shieldSpeed;
      const step = Math.min(distanceLeft, legLeft);
      const dx = (projectile.vx / speed) * step;
      const dy = (projectile.vy / speed) * step;
      const toX = projectile.x + dx;
      const toY = projectile.y + dy;
      const obstacleAt = this.world.obstacleHitAt(projectile.x, projectile.y, toX, toY);
      const edgeAt = this.arenaExitAt(projectile, toX, toY);
      const wallAt =
        obstacleAt === undefined
          ? edgeAt
          : edgeAt === undefined
            ? obstacleAt
            : Math.min(obstacleAt, edgeAt);
      const hit = this.firstShieldVictim(projectile, toX, toY, wallAt);

      if (hit) {
        const travelled = step * hit.at;
        projectile.x += dx * hit.at;
        projectile.y += dy * hit.at;
        projectile.shieldLegDistance += travelled;
        distanceLeft -= travelled;
        projectile.hitIds.add(hit.id);
        this.world.pushFx({ k: 'hit', x: hit.zombie.x, y: hit.zombie.y, s: 'throwshield' });
        this.world.damageZombie(
          hit.id,
          hit.zombie,
          projectile.damage,
          projectile.ownerId,
          projectile.shieldArmorPierce,
        );
        if (!this.redirectShield(projectile)) {
          this.startShieldReturn(projectile);
          return false;
        }
        continue;
      }

      if (wallAt !== undefined) {
        // Stay just outside the prop. Starting the redirected segment exactly
        // on its inclusive edge would count the same obstacle twice.
        const safeAt = Math.max(0, wallAt - Math.min(0.025, 2 / Math.max(step, 1)));
        const travelled = step * safeAt;
        projectile.x += dx * safeAt;
        projectile.y += dy * safeAt;
        projectile.shieldLegDistance += travelled;
        distanceLeft -= travelled;
        this.world.pushFx({ k: 'hit', x: projectile.x, y: projectile.y, s: 'wall' });
        // Arena limits end the outbound journey. Solid map props count as one
        // ricochet and can redirect the shield towards the next visible enemy.
        const hitArenaEdge =
          edgeAt !== undefined && (obstacleAt === undefined || edgeAt <= obstacleAt);
        if (hitArenaEdge) {
          this.startShieldReturn(projectile);
          return false;
        }
        if (obstacleAt !== undefined && (edgeAt === undefined || obstacleAt < edgeAt)) {
          if (!this.redirectShield(projectile)) {
            this.startShieldReturn(projectile);
            return false;
          }
          continue;
        }
      }

      projectile.x = toX;
      projectile.y = toY;
      projectile.shieldLegDistance += step;
      distanceLeft -= step;
      if (projectile.shieldLegDistance >= projectile.shieldLegRange - 0.01) {
        this.startShieldReturn(projectile);
        return false;
      }
    }
    return false;
  }

  /** Finds the first still-unused enemy before a wall on the current flight segment. */
  private firstShieldVictim(
    projectile: ProjectileState,
    toX: number,
    toY: number,
    wallAt: number | undefined,
  ) {
    let first: { id: string; zombie: ZombieState; at: number } | undefined;
    for (const [id, zombie] of this.world.state.zombies.entries()) {
      if (projectile.hitIds.has(id)) continue;
      const at = this.world.segmentCircleAt(
        projectile.x,
        projectile.y,
        toX,
        toY,
        zombie.x,
        zombie.y,
        zombie.radius + projectile.radius,
      );
      if (at === undefined || (wallAt !== undefined && at > wallAt)) continue;
      if (!first || at < first.at) first = { id, zombie, at };
    }
    return first;
  }

  /** One real hit spends one of the eight redirects and aims a fresh flight leg. */
  private redirectShield(projectile: ProjectileState) {
    if (projectile.shieldBouncesRemaining <= 0) return false;
    let target: ZombieState | undefined;
    let bestDistance = projectile.shieldLegRange;
    for (const [id, zombie] of this.world.state.zombies.entries()) {
      if (projectile.hitIds.has(id)) continue;
      const distance = Math.hypot(zombie.x - projectile.x, zombie.y - projectile.y);
      if (distance > bestDistance) continue;
      if (!this.world.hasLineOfSight(projectile.x, projectile.y, zombie.x, zombie.y)) continue;
      bestDistance = distance;
      target = zombie;
    }
    if (!target) return false;
    projectile.shieldBouncesRemaining -= 1;
    projectile.shieldLegDistance = 0;
    const angle = Math.atan2(target.y - projectile.y, target.x - projectile.x);
    projectile.vx = Math.cos(angle) * projectile.shieldSpeed;
    projectile.vy = Math.sin(angle) * projectile.shieldSpeed;
    return true;
  }

  /** Return flight ignores scenery, seeks only its owner and pierces every enemy once. */
  private returnShield(
    projectile: ProjectileState,
    owner: { x: number; y: number },
    delta: number,
  ) {
    const angle = Math.atan2(owner.y - projectile.y, owner.x - projectile.x);
    projectile.vx = Math.cos(angle) * projectile.shieldSpeed;
    projectile.vy = Math.sin(angle) * projectile.shieldSpeed;
    const toX = projectile.x + projectile.vx * delta;
    const toY = projectile.y + projectile.vy * delta;
    const catchAt = this.world.segmentCircleAt(
      projectile.x,
      projectile.y,
      toX,
      toY,
      owner.x,
      owner.y,
      projectile.radius + 24,
    );

    const victims: Array<{ id: string; zombie: ZombieState; at: number }> = [];
    for (const [id, zombie] of this.world.state.zombies.entries()) {
      if (projectile.hitIds.has(id)) continue;
      const at = this.world.segmentCircleAt(
        projectile.x,
        projectile.y,
        toX,
        toY,
        zombie.x,
        zombie.y,
        zombie.radius + projectile.radius,
      );
      if (at !== undefined && (catchAt === undefined || at <= catchAt)) {
        victims.push({ id, zombie, at });
      }
    }
    victims.sort((a, b) => a.at - b.at);
    for (const { id, zombie } of victims) {
      projectile.hitIds.add(id);
      this.world.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: 'throwshield-return' });
      this.world.damageZombie(
        id,
        zombie,
        projectile.damage,
        projectile.ownerId,
        projectile.shieldArmorPierce,
      );
    }
    if (catchAt !== undefined) return true;
    projectile.x = toX;
    projectile.y = toY;
    return false;
  }

  private startShieldReturn(projectile: ProjectileState) {
    projectile.shieldReturning = true;
    projectile.damage = projectile.shieldReturnDamage;
    projectile.hitIds.clear();
  }

  /** Share of the current segment at which the shield first leaves the playable arena. */
  private arenaExitAt(projectile: ProjectileState, toX: number, toY: number) {
    const minX = projectile.radius;
    const maxX = ARENA.width - projectile.radius;
    const minY = projectile.radius;
    const maxY = ARENA.height - projectile.radius;
    let at: number | undefined;
    const consider = (value: number) => {
      if (value < 0 || value > 1) return;
      if (at === undefined || value < at) at = value;
    };
    if (toX < minX) consider((minX - projectile.x) / (toX - projectile.x));
    if (toX > maxX) consider((maxX - projectile.x) / (toX - projectile.x));
    if (toY < minY) consider((minY - projectile.y) / (toY - projectile.y));
    if (toY > maxY) consider((maxY - projectile.y) / (toY - projectile.y));
    return at;
  }

  /** Todesurteil rewards a clean kill without granting another shot immediately. */
  private reducePrecisionCooldown(ownerId: string) {
    const player = this.world.state.players.get(ownerId);
    const runtime = this.world.runtime.get(ownerId);
    if (!player || !runtime || runtime.ability !== 'precisionShot') return;
    if (player.abilityCharges >= player.abilityMax || runtime.abilityRecharge.length === 0) return;
    runtime.abilityRecharge.sort((a, b) => a - b);
    runtime.abilityRecharge[0] *= 1 - PRECISION_KILL_COOLDOWN_REDUCTION;
    player.abilityCooldown = Math.max(0, runtime.abilityRecharge[0]);
    this.world.pushFx({ k: 'heal', x: player.x, y: player.y, s: 'precision-reload' });
  }

  /** The shield eats the complete shot before splash, chain or pierce can trigger. */
  private blockedByShield(projectile: ProjectileState, zombie: ZombieState) {
    if (zombie.shielding > 0) return true;
    const shield = ZOMBIES[zombie.type].frontShield;
    if (!shield) return false;
    const incoming = Math.atan2(-projectile.vy, -projectile.vx);
    let difference = incoming - zombie.rotation;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return Math.abs(difference) <= shield.arc / 2;
  }

  private detonate(projectile: ProjectileState, x: number, y: number) {
    const radius = projectile.splashRadius;
    this.world.pushFx({ k: 'explosion', x, y, r: radius, s: projectile.kind });
    // Acid does not just burst, it stays: the puddle keeps eating whatever
    // walks through it long after the shot is gone.
    if (projectile.acidRadius > 0 && projectile.acidSeconds > 0) {
      this.world.spawnHazard({
        kind: 'acid',
        x,
        y,
        r: projectile.acidRadius,
        life: projectile.acidSeconds,
        damage: projectile.acidDps,
        ownerId: projectile.ownerId,
      });
    }
    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((zombie, id) => {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance <= radius + zombie.radius) victims.push([id, zombie]);
    });
    for (const [id, zombie] of victims) {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      const falloff = Math.max(0.35, 1 - distance / (radius + zombie.radius));
      if (projectile.pull > 0 && distance > 0) {
        const pull = projectile.pull * falloff;
        zombie.x = this.world.clamp(zombie.x + ((x - zombie.x) / distance) * pull, 0, ARENA.width);
        zombie.y = this.world.clamp(zombie.y + ((y - zombie.y) / distance) * pull, 0, ARENA.height);
      }
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

  /** A Kugelblitz or thrown hammer keeps discharging while the body flies on. */
  private pulseLightning(projectile: ProjectileState) {
    const targets = [...this.world.state.zombies.entries()]
      .map(([id, zombie]) => ({
        id,
        zombie,
        distance: Math.hypot(zombie.x - projectile.x, zombie.y - projectile.y),
      }))
      .filter(({ zombie, distance }) => distance <= projectile.lightningRange + zombie.radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, projectile.lightningTargets);
    for (const { id, zombie } of targets) {
      this.world.pushFx({
        k: 'chain',
        x: projectile.x,
        y: projectile.y,
        x2: zombie.x,
        y2: zombie.y,
        s: projectile.kind,
      });
      this.world.damageZombie(id, zombie, projectile.lightningDamage, projectile.ownerId);
    }
  }

  /** The Risskanone tears open a damaging gravity pocket without consuming its core. */
  private pulseRift(projectile: ProjectileState) {
    this.world.pushFx({
      k: 'explosion',
      x: projectile.x,
      y: projectile.y,
      r: projectile.riftRadius,
      s: projectile.kind,
    });
    const victims = [...this.world.state.zombies.entries()];
    for (const [id, zombie] of victims) {
      const distance = Math.hypot(zombie.x - projectile.x, zombie.y - projectile.y);
      if (distance > projectile.riftRadius + zombie.radius) continue;
      const falloff = Math.max(
        0.45,
        1 - distance / Math.max(1, projectile.riftRadius + zombie.radius),
      );
      if (projectile.riftPull > 0 && distance > 0) {
        const pull = projectile.riftPull * falloff;
        zombie.x = this.world.clamp(
          zombie.x + ((projectile.x - zombie.x) / distance) * pull,
          0,
          ARENA.width,
        );
        zombie.y = this.world.clamp(
          zombie.y + ((projectile.y - zombie.y) / distance) * pull,
          0,
          ARENA.height,
        );
      }
      this.world.damageZombie(id, zombie, projectile.riftDamage * falloff, projectile.ownerId);
    }
  }
}
