import { DEFENSES, EMPTY_UPGRADES } from '../../../shared/game-types.js';
import type { GameWorld } from './world.js';

/** Every built turret picks its own target and fires on its own clock. */
export class TurretSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number) {
    this.world.state.defenses.forEach((defense) => {
      const config = DEFENSES[defense.type];
      if (config.kind !== 'turret') return;
      // A hangar carries no gun; its drones do the shooting, see DroneSystem.
      if (config.drones) return;
      defense.cooldown = Math.max(0, defense.cooldown - delta);

      const upgrades = this.world.runtime.get(defense.ownerId)?.upgrades ?? EMPTY_UPGRADES;
      const range = (config.range ?? 380) * (1 + upgrades.turretRange * 0.01);
      const targets = this.world.nearestZombies(
        defense.x,
        defense.y,
        range,
        config.targets ?? 1,
        true,
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
}
