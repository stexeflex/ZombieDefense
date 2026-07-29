import { DEFENSES, EMPTY_UPGRADES, type DefenseType } from '../../../shared/game-types.js';
import type { ZombieState } from '../state/game-state.js';
import type { GameWorld } from './world.js';

interface MortarStrike {
  x: number;
  y: number;
  radius: number;
  damage: number;
  armorPierce: number;
  ownerId: string;
  source: DefenseType;
  time: number;
}

/** Every built turret picks its own target and fires on its own clock. */
export class TurretSystem {
  private mortarStrikes: MortarStrike[] = [];

  constructor(private readonly world: GameWorld) {}

  clear() {
    this.mortarStrikes = [];
  }

  update(delta: number) {
    this.updateMortarStrikes(delta);
    this.world.state.defenses.forEach((defense) => {
      const config = DEFENSES[defense.type];
      if (config.kind !== 'turret') return;
      // A hangar carries no gun; its drones do the shooting, see DroneSystem.
      if (config.drones) return;
      defense.cooldown = Math.max(0, defense.cooldown - delta);

      const upgrades = this.world.runtime.get(defense.ownerId)?.upgrades ?? EMPTY_UPGRADES;
      const range = (config.range ?? 380) * (1 + upgrades.turretRange * 0.01);
      const tank = config.targetTanky ? this.tankyTarget(defense.x, defense.y, range) : undefined;
      const targets = tank
        ? [tank]
        : this.world.nearestZombies(
            defense.x,
            defense.y,
            range,
            config.targets ?? 1,
            !config.mortarImpactSeconds,
          );
      if (targets.length === 0) return;
      if (defense.cooldown > 0) return;

      const bonus = 1 + upgrades.turretDamage * 0.02;
      const speed = config.speed ?? 800;
      const pellets = config.pellets ?? 1;
      const fireProjectile = (aim: number) => {
        const projectile = this.world.createProjectile(
          defense.ownerId,
          defense.x + Math.cos(aim) * 26,
          defense.y + Math.sin(aim) * 26,
          aim,
          (config.damage ?? 10) * bonus,
          speed,
          `turret_${defense.type}`,
        );
        projectile.pierce = config.pierce ?? 0;
        projectile.life = range / speed;
        projectile.chain = config.chain ?? 0;
        projectile.chainRange = config.chainRange ?? 0;
        projectile.burn = (config.burn ?? 0) * bonus;
        projectile.burnSeconds = config.burnSeconds ?? 0;
        projectile.slow = config.slow ?? 0;
        projectile.slowSeconds = config.slowSeconds ?? 0;
        projectile.acidRadius = config.acidRadius ?? 0;
        projectile.acidDps = (config.acidDps ?? 0) * bonus;
        projectile.acidSeconds = config.acidSeconds ?? 0;
        if (config.burn || config.slow) projectile.radius = 10;
        if (config.splashRadius) {
          projectile.splashRadius = config.splashRadius;
          projectile.splashDamage = (config.splashDamage ?? 0) * bonus;
          projectile.radius = 7;
        }
      };
      const muzzle = (aim: number) =>
        this.world.pushFx({
          k: 'muzzle',
          x: defense.x + Math.cos(aim) * 26,
          y: defense.y + Math.sin(aim) * 26,
          a: aim,
          s: defense.type,
        });

      if (config.mortarImpactSeconds && config.splashRadius) {
        const target = targets[0];
        const aim = Math.atan2(target.y - defense.y, target.x - defense.x);
        defense.rotation = aim;
        this.mortarStrikes.push({
          x: target.x,
          y: target.y,
          radius: config.splashRadius,
          damage: (config.damage ?? 10) * bonus,
          armorPierce: config.armorPierce ?? 0,
          ownerId: defense.ownerId,
          source: defense.type,
          time: config.mortarImpactSeconds,
        });
        this.world.pushFx({
          k: 'warning',
          x: target.x,
          y: target.y,
          r: config.splashRadius,
          d: config.mortarImpactSeconds,
          s: defense.type,
        });
        muzzle(aim);
        defense.cooldown = config.fireDelay ?? 0.25;
        return;
      }

      if (config.radialShots) {
        // Offset every volley by half a slot so repeated salvos cover the small
        // gaps between the previous 24 lanes.
        defense.rotation = (defense.rotation + Math.PI / config.radialShots) % (Math.PI * 2);
        for (let shot = 0; shot < config.radialShots; shot += 1) {
          const aim = defense.rotation + (shot * Math.PI * 2) / config.radialShots;
          fireProjectile(aim);
          muzzle(aim);
        }
        defense.cooldown = config.fireDelay ?? 0.25;
        return;
      }

      defense.rotation = Math.atan2(targets[0].y - defense.y, targets[0].x - defense.x);
      for (const target of targets) {
        const aim = Math.atan2(target.y - defense.y, target.x - defense.x);
        for (let pellet = 0; pellet < pellets; pellet += 1) {
          const spread = (Math.random() - 0.5) * (config.spread ?? 0) * 2;
          fireProjectile(aim + spread);
        }
        muzzle(aim);
      }
      defense.cooldown = config.fireDelay ?? 0.25;
    });
  }

  /** Slow high-health enemies win; distance only breaks otherwise close ties. */
  private tankyTarget(x: number, y: number, range: number) {
    let best: ZombieState | undefined;
    let bestScore = -Infinity;
    this.world.state.zombies.forEach((zombie) => {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance > range) return;
      const score = zombie.maxHealth / Math.max(35, zombie.baseSpeed) - distance * 0.015;
      if (score <= bestScore) return;
      best = zombie;
      bestScore = score;
    });
    return best;
  }

  private updateMortarStrikes(delta: number) {
    const pending: MortarStrike[] = [];
    for (const strike of this.mortarStrikes) {
      strike.time -= delta;
      if (strike.time > 0) {
        pending.push(strike);
        continue;
      }
      this.world.pushFx({
        k: 'explosion',
        x: strike.x,
        y: strike.y,
        r: strike.radius,
        s: `turret_${strike.source}`,
      });
      const victims: Array<[string, ZombieState]> = [];
      this.world.state.zombies.forEach((zombie, id) => {
        if (Math.hypot(zombie.x - strike.x, zombie.y - strike.y) <= strike.radius + zombie.radius) {
          victims.push([id, zombie]);
        }
      });
      for (const [id, zombie] of victims) {
        const distance = Math.hypot(zombie.x - strike.x, zombie.y - strike.y);
        const falloff = Math.max(0.45, 1 - distance / (strike.radius + zombie.radius));
        this.world.damageZombie(
          id,
          zombie,
          strike.damage * falloff,
          strike.ownerId,
          strike.armorPierce,
        );
      }
    }
    this.mortarStrikes = pending;
  }
}
