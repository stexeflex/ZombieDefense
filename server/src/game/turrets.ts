import { DEFENSES, EMPTY_UPGRADES } from '../../../shared/game-types.js';
import type { GameWorld } from './world.js';

/** Every built turret picks its own target and fires on its own clock. */
export class TurretSystem {
  constructor(private readonly world: GameWorld) {}

  update(delta: number) {
    this.world.state.defenses.forEach((defense) => {
      const config = DEFENSES[defense.type];
      if (config.kind !== 'turret') return;
      defense.cooldown = Math.max(0, defense.cooldown - delta);

      const upgrades = this.world.runtime.get(defense.ownerId)?.upgrades ?? EMPTY_UPGRADES;
      const range = (config.range ?? 380) * (1 + upgrades.turretRange * 0.01);
      const target = this.world.nearestZombie(defense.x, defense.y, range, true);
      if (!target) return;
      defense.rotation = Math.atan2(target.y - defense.y, target.x - defense.x);
      if (defense.cooldown > 0) return;

      const bonus = 1 + upgrades.turretDamage * 0.02;
      const speed = config.speed ?? 800;
      const pellets = config.pellets ?? 1;
      for (let pellet = 0; pellet < pellets; pellet += 1) {
        const spread = (Math.random() - 0.5) * (config.spread ?? 0) * 2;
        const projectile = this.world.createProjectile(
          defense.ownerId,
          defense.x + Math.cos(defense.rotation) * 26,
          defense.y + Math.sin(defense.rotation) * 26,
          defense.rotation + spread,
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
        if (config.burn || config.slow) projectile.radius = 10;
        if (config.splashRadius) {
          projectile.splashRadius = config.splashRadius;
          projectile.splashDamage = (config.splashDamage ?? 0) * bonus;
          projectile.radius = 7;
        }
      }
      defense.cooldown = config.fireDelay ?? 0.25;
      this.world.pushFx({
        k: 'muzzle',
        x: defense.x + Math.cos(defense.rotation) * 26,
        y: defense.y + Math.sin(defense.rotation) * 26,
        a: defense.rotation,
        s: defense.type,
      });
    });
  }
}
