import {
  ARENA,
  ZOMBIES,
  splitAbility,
  timedAbilities,
  type AbilityOf,
  type TimedAbility,
} from '../../../shared/game-types.js';
import type { ZombieState } from '../state/game-state.js';
import type { GameWorld } from './world.js';

/** How often a burning or toxic pool applies its damage. */
const POOL_TICK = 0.25;
/** Above this many bodies on the field, nobody calls in more. */
const CROWDED_FIELD = 74;

/**
 * Every boss and mini boss trick lives here: charges, telegraphed area hits,
 * mortar volleys, healing, splitting, pulling and the pools they leave behind.
 * A zombie type just lists which of them it owns.
 */
export class AbilitySystem {
  constructor(private readonly world: GameWorld) {}

  /** Runs the ability timers of one zombie; called from the zombie loop. */
  tick(zombie: ZombieState, delta: number) {
    zombie.casting = Math.max(0, zombie.casting - delta);
    zombie.shielding = Math.max(0, zombie.shielding - delta);
    const abilities = timedAbilities(zombie.type);
    if (abilities.length === 0) return;
    for (let index = 0; index < abilities.length; index += 1) {
      const ability = abilities[index];
      const remaining = (zombie.abilityTimers[index] ?? ability.every) - delta;
      if (remaining > 0) {
        zombie.abilityTimers[index] = remaining;
        continue;
      }
      zombie.abilityTimers[index] = ability.every;
      this.cast(zombie, ability, index);
    }
  }

  private cast(zombie: ZombieState, ability: TimedAbility, index: number) {
    switch (ability.kind) {
      case 'charge':
        return this.charge(zombie, ability);
      case 'slam':
        return this.slam(zombie, ability);
      case 'summon':
        return this.summon(zombie, ability, index);
      case 'heal':
        return this.heal(zombie, ability);
      case 'mortar':
        return this.mortar(zombie, ability);
      case 'vortex':
        return this.vortex(zombie, ability);
      case 'puddle':
        return this.puddle(zombie, ability);
      case 'phaseShield':
        return this.phaseShield(zombie, ability);
    }
  }

  // ---------------------------------------------------------------- abilities

  private charge(zombie: ZombieState, ability: AbilityOf<'charge'>) {
    zombie.charging = ability.duration;
    zombie.chargeSpeed = ability.speed;
    this.world.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'charge' });
  }

  private slam(zombie: ZombieState, ability: AbilityOf<'slam'>) {
    const damage = ability.damage * this.world.damageScale() * this.world.endlessDamageMultiplier();
    if (!ability.telegraph) {
      this.world.pushFx({ k: 'explosion', x: zombie.x, y: zombie.y, r: ability.radius, s: 'slam' });
      this.world.blast(zombie.x, zombie.y, ability.radius, damage, 1.5);
      return;
    }
    // A big hit is announced first: the red ring is the only fair warning.
    zombie.casting = ability.telegraph;
    this.warn(zombie.x, zombie.y, ability.radius, ability.telegraph, damage);
  }

  private summon(zombie: ZombieState, ability: AbilityOf<'summon'>, slot: number) {
    // A crowded field gets no reinforcements, and a summoner that used up its
    // budget calls in nothing at all.
    if (this.world.state.zombies.size > CROWDED_FIELD) return;
    const budget = zombie.abilityBudget[slot] ?? 0;
    if (budget <= 0) return;
    const amount = Math.min(ability.count, budget);
    zombie.abilityBudget[slot] = budget - amount;
    this.world.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: 90, s: 'summon' });
    for (let index = 0; index < amount; index += 1) {
      if (this.world.atZombieCap()) return;
      const angle = (Math.PI * 2 * index) / amount + Math.random();
      this.world.spawnZombie(ability.type, {
        x: this.world.clamp(
          zombie.x + Math.cos(angle) * (zombie.radius + 46),
          40,
          ARENA.width - 40,
        ),
        y: this.world.clamp(
          zombie.y + Math.sin(angle) * (zombie.radius + 46),
          40,
          ARENA.height - 40,
        ),
      });
    }
  }

  private heal(zombie: ZombieState, ability: AbilityOf<'heal'>) {
    let healed = 0;
    this.world.state.zombies.forEach((other) => {
      const itself = other === zombie;
      if (itself && !ability.self) return;
      if (Math.hypot(other.x - zombie.x, other.y - zombie.y) > ability.radius) return;
      if (other.health >= other.maxHealth) return;
      const share = itself ? (ability.selfAmount ?? ability.amount) : ability.amount;
      this.world.healZombie(other, other.maxHealth * share);
      healed += 1;
    });
    if (healed === 0) return;
    this.world.pushFx({ k: 'heal', x: zombie.x, y: zombie.y, r: ability.radius, s: 'boss' });
  }

  private mortar(zombie: ZombieState, ability: AbilityOf<'mortar'>) {
    const targets = this.world.livingPlayers();
    if (targets.length === 0) return;
    zombie.casting = ability.telegraph;
    const damage = ability.damage * this.world.damageScale() * this.world.endlessDamageMultiplier();
    for (let shot = 0; shot < ability.shots; shot += 1) {
      const target = targets[shot % targets.length];
      if (Math.hypot(target.x - zombie.x, target.y - zombie.y) > ability.range) continue;
      const jitter = shot === 0 ? 0 : 90 + Math.random() * 120;
      const angle = Math.random() * Math.PI * 2;
      this.warn(
        target.x + Math.cos(angle) * jitter,
        target.y + Math.sin(angle) * jitter,
        ability.radius,
        ability.telegraph + shot * 0.18,
        damage,
      );
    }
    this.world.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'mortar' });
  }

  private vortex(zombie: ZombieState, ability: AbilityOf<'vortex'>) {
    zombie.casting = ability.duration;
    this.spawnHazard({
      kind: 'pull',
      x: zombie.x,
      y: zombie.y,
      r: ability.radius,
      life: ability.duration,
      damage: 0,
    });
    this.world.state.players.forEach((player) => {
      if (!player.alive) return;
      const dx = zombie.x - player.x;
      const dy = zombie.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > ability.radius) return;
      const runtime = this.world.runtime.get(player.id);
      if (!runtime) return;
      const strength = ability.force * (ability.push ? 1 : Math.min(1, distance / 260));
      const sign = ability.push ? -1 : 1;
      runtime.pushX += (dx / distance) * strength * sign;
      runtime.pushY += (dy / distance) * strength * sign;
    });
    this.world.pushFx({
      k: 'boss',
      x: zombie.x,
      y: zombie.y,
      r: ability.radius / 2,
      s: ability.push ? 'push' : 'pull',
    });
  }

  private puddle(zombie: ZombieState, ability: AbilityOf<'puddle'>) {
    const dps = ability.dps * this.world.damageScale() * this.world.endlessDamageMultiplier();
    for (let index = 0; index < ability.count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * ability.spread;
      this.spawnHazard({
        kind: ability.hazard,
        x: zombie.x + Math.cos(angle) * distance,
        y: zombie.y + Math.sin(angle) * distance,
        r: ability.radius,
        life: ability.life,
        damage: dps,
      });
    }
  }

  private phaseShield(zombie: ZombieState, ability: AbilityOf<'phaseShield'>) {
    zombie.shielding = ability.duration;
    this.world.pushFx({ k: 'shield', x: zombie.x, y: zombie.y, r: zombie.radius + 12, s: 'phase' });
  }

  // ------------------------------------------------------------------- death

  /** Bosses that break apart drop their smaller halves where they fell. */
  split(zombie: ZombieState) {
    const ability = splitAbility(zombie.type);
    if (!ability) return;
    this.world.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'split' });
    for (let index = 0; index < ability.count; index += 1) {
      if (this.world.atZombieCap()) return;
      const angle = (Math.PI * 2 * index) / ability.count + Math.random() * 0.6;
      this.world.spawnZombie(ability.type, {
        x: this.world.clamp(
          zombie.x + Math.cos(angle) * (zombie.radius + 30),
          40,
          ARENA.width - 40,
        ),
        y: this.world.clamp(
          zombie.y + Math.sin(angle) * (zombie.radius + 30),
          40,
          ARENA.height - 40,
        ),
      });
    }
  }

  // ----------------------------------------------------------------- hazards

  private warn(x: number, y: number, radius: number, telegraph: number, damage: number) {
    this.spawnHazard({ kind: 'warning', x, y, r: radius, life: telegraph, damage });
  }

  private spawnHazard(options: Parameters<GameWorld['spawnHazard']>[0]) {
    this.world.spawnHazard(options);
  }

  /** Warnings go off when they run out, pools keep burning while they last. */
  updateHazards(delta: number) {
    const finished: string[] = [];
    this.world.state.hazards.forEach((hazard, id) => {
      hazard.life -= delta;
      // Acid belongs to the squad: it eats zombies and leaves everyone else be.
      if (hazard.kind === 'acid') {
        hazard.tick -= delta;
        if (hazard.tick <= 0) {
          hazard.tick = POOL_TICK;
          const victims = [...this.world.state.zombies.entries()].filter(
            ([, zombie]) =>
              Math.hypot(zombie.x - hazard.x, zombie.y - hazard.y) <= hazard.r + zombie.radius,
          );
          for (const [zombieId, zombie] of victims) {
            this.world.damageZombie(zombieId, zombie, hazard.damage * POOL_TICK, hazard.ownerId);
          }
          this.world.pushFx({ k: 'burn', x: hazard.x, y: hazard.y, r: hazard.r, s: hazard.kind });
        }
      }
      if (hazard.kind === 'lava' || hazard.kind === 'poison') {
        hazard.tick -= delta;
        if (hazard.tick <= 0) {
          hazard.tick = POOL_TICK;
          this.world.state.players.forEach((player) => {
            if (!player.alive) return;
            if (Math.hypot(player.x - hazard.x, player.y - hazard.y) > hazard.r) return;
            this.world.damagePlayer(player, hazard.damage * POOL_TICK);
          });
          if (hazard.kind === 'lava') {
            this.world.damageStructures(hazard.x, hazard.y, hazard.r, hazard.damage * POOL_TICK);
          }
          this.world.pushFx({ k: 'burn', x: hazard.x, y: hazard.y, r: hazard.r, s: hazard.kind });
        }
      }
      if (hazard.life > 0) return;
      finished.push(id);
      if (hazard.kind !== 'warning') return;
      this.world.pushFx({ k: 'explosion', x: hazard.x, y: hazard.y, r: hazard.r, s: 'mortar' });
      this.world.blast(hazard.x, hazard.y, hazard.r, hazard.damage, 1.4);
    });
    for (const id of finished) this.world.state.hazards.delete(id);
  }

  clearHazards() {
    this.world.state.hazards.clear();
  }

  /** Picks the toughest boss or mini boss on the field for the health bar. */
  updateBossBar() {
    let boss: ZombieState | undefined;
    this.world.state.zombies.forEach((zombie) => {
      const rank = ZOMBIES[zombie.type].rank;
      if (rank !== 'boss' && rank !== 'mini') return;
      if (!boss || zombie.maxHealth > boss.maxHealth) boss = zombie;
    });
    const state = this.world.state;
    if (!boss) {
      state.bossName = '';
      state.bossHealth = 0;
      state.bossMaxHealth = 0;
      return;
    }
    state.bossName = ZOMBIES[boss.type].label;
    state.bossHealth = Math.max(0, Math.round(boss.health));
    state.bossMaxHealth = Math.round(boss.maxHealth);
  }
}
