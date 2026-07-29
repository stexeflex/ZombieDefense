import {
  ARENA,
  DEFENSES,
  PLAYER_RADIUS,
  ZOMBIES,
  circleOverlapsVehicle,
  hasteAura,
  pushOutOfVehicle,
  sellValue,
  type ZombieType,
} from '../../../shared/game-types.js';
import type { DefenseState, ZombieState } from '../state/game-state.js';
import type { AbilitySystem } from './abilities.js';
import type { GameWorld } from './world.js';

/** Walking, attacking, burning, pushing each other around and dying. */
export class ZombieSystem {
  constructor(
    private readonly world: GameWorld,
    private readonly abilities: AbilitySystem,
  ) {
    // Explosions and splits happen the moment a body drops, wherever the last
    // hit came from.
    world.onZombieKilled = (zombie) => {
      this.abilities.split(zombie);
      if (ZOMBIES[zombie.type].explode) this.explode(zombie);
    };
  }

  update(delta: number) {
    const exploding: ZombieState[] = [];
    this.applyHaste();

    this.world.state.zombies.forEach((zombie, id) => {
      const config = ZOMBIES[zombie.type];
      zombie.attackCooldown = Math.max(0, zombie.attackCooldown - delta);
      zombie.attacking = Math.max(0, zombie.attacking - delta);

      if (zombie.burning > 0) {
        zombie.burning = Math.max(0, zombie.burning - delta);
        this.world.damageZombie(id, zombie, zombie.burnDps * delta, zombie.lastAttacker);
        if (!this.world.state.zombies.has(id)) return;
      }
      if (zombie.chilled > 0) zombie.chilled = Math.max(0, zombie.chilled - delta);

      this.abilities.tick(zombie, delta);
      if (!this.world.state.zombies.has(id)) return;

      zombie.speed = this.currentSpeed(zombie, delta);
      if (!this.applyGroundDefenses(id, zombie, delta)) return;

      const target = this.world.nearestLivingPlayer(zombie.x, zombie.y);
      const state = this.world.state;
      const playerDistance = target
        ? Math.hypot(target.x - zombie.x, target.y - zombie.y)
        : Infinity;
      const objectiveDistance = state.objectiveActive
        ? Math.hypot(state.objectiveX - zombie.x, state.objectiveY - zombie.y)
        : Infinity;
      // Mission objectives pull a meaningful part of the horde. Players can
      // still peel enemies away by meeting them before they reach the target.
      const attacksObjective =
        state.objectiveActive && (!target || objectiveDistance <= playerDistance * 0.5);
      if (!target && !attacksObjective) return;
      const targetX = attacksObjective ? state.objectiveX : target!.x;
      const targetY = attacksObjective ? state.objectiveY : target!.y;

      const navigation = this.navigationTarget(zombie, targetX, targetY);
      const angle = Math.atan2(navigation.y - zombie.y, navigation.x - zombie.x);
      const navigationDistance = Math.hypot(navigation.x - zombie.x, navigation.y - zombie.y);
      zombie.rotation = config.frontShield
        ? this.turnTowards(zombie.rotation, angle, config.frontShield.turnSpeed * delta)
        : angle;
      const contact =
        zombie.radius +
        (attacksObjective ? Math.max(34, state.objectiveRadius * 0.72) : PLAYER_RADIUS);
      const distance = Math.hypot(targetX - zombie.x, targetY - zombie.y);
      const stepX = Math.cos(angle) * zombie.speed * delta;
      const stepY = Math.sin(angle) * zombie.speed * delta;
      const blocking = this.world.blockingDefense(zombie, stepX, stepY);
      const hull = blocking
        ? undefined
        : this.world.blockingVehicle(zombie.x + stepX, zombie.y + stepY, zombie.radius);

      if (hull) {
        // A hull is worked on exactly like a barricade — it is the wall the
        // squad drives around in.
        if (config.explode) {
          exploding.push(zombie);
          return;
        }
        if (zombie.attackCooldown <= 0) {
          zombie.attackCooldown = this.attackDelay(zombie.type, 0.85);
          zombie.attacking = 0.3;
          this.world.hullMelee(
            hull,
            zombie.damage * this.structureBonus(zombie),
            zombie.x,
            zombie.y,
          );
        }
        zombie.stuckTimer = 0;
        zombie.bestDistance = distance;
      } else if (blocking) {
        // An exploder deals no melee damage, it detonates on whatever stops it.
        if (config.explode) {
          exploding.push(zombie);
          return;
        }
        if (zombie.attackCooldown <= 0) {
          const defenseConfig = DEFENSES[blocking.type];
          blocking.health -= zombie.damage * this.structureBonus(zombie);
          zombie.attackCooldown = this.attackDelay(zombie.type, 0.85);
          zombie.attacking = 0.3;
          this.world.pushFx({ k: 'structure', x: blocking.x, y: blocking.y, s: blocking.type });
          if (defenseConfig.thorns) {
            this.world.damageZombie(id, zombie, defenseConfig.thorns, blocking.ownerId);
            this.world.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: 'spike' });
            if (!this.world.state.zombies.has(id)) return;
          }
          if (defenseConfig.slow) {
            this.world.chillZombie(zombie, defenseConfig.slow, defenseConfig.slowSeconds ?? 1.2);
          }
          if (blocking.health <= 0) {
            this.world.destroyDefense(blocking);
          }
        }
        zombie.stuckTimer = 0;
        zombie.bestDistance = distance;
      } else if (distance > contact) {
        const moved = this.moveZombie(zombie, stepX, stepY);
        const progress = zombie.path.length > 0 ? navigationDistance : distance;
        if (moved && progress < zombie.bestDistance - (zombie.path.length > 0 ? 1 : 3)) {
          zombie.bestDistance = progress;
          zombie.stuckTimer = 0;
        } else {
          zombie.stuckTimer += delta;
          if (zombie.path.length > 0 && zombie.stuckTimer > 0.8) {
            // A dynamic shove can invalidate the first cells of a route.
            zombie.path = [];
            zombie.stuckTimer = 0;
            zombie.bestDistance = Infinity;
            zombie.avoidSide *= -1;
          }
        }
      } else {
        zombie.stuckTimer = 0;
        zombie.bestDistance = distance;
      }

      if (distance < contact + 8) {
        if (config.explode) {
          exploding.push(zombie);
          return;
        }
        if (zombie.attackCooldown <= 0) {
          zombie.attackCooldown = this.attackDelay(zombie.type, 1);
          zombie.attacking = 0.3;
          if (attacksObjective) {
            this.world.damageObjective(zombie.damage * this.structureBonus(zombie));
            return;
          }
          const crewed = this.world.vehicleOf(target!.id);
          if (crewed) {
            this.world.hullMelee(
              crewed,
              zombie.damage * this.structureBonus(zombie),
              zombie.x,
              zombie.y,
            );
            return;
          }
          // A swing that runs into a dash gets its own cue instead of blood.
          const landed = this.world.damagePlayer(target!, zombie.damage);
          this.world.pushFx(
            landed
              ? { k: 'blood', x: target!.x, y: target!.y, s: 'player' }
              : { k: 'deflect', x: target!.x, y: target!.y, s: 'dash' },
          );
        }
      }
    });

    for (const zombie of exploding) this.detonate(zombie);
    this.separate();
    this.pushOffPlayers();
    this.pushOffVehicles();
    this.freeFromObstacles();
  }

  /**
   * Passable defenses are floor traps, not walls. Anything crossing one is
   * slowed and damaged while every body on top of it wears the trap down.
   */
  private applyGroundDefenses(id: string, zombie: ZombieState, delta: number) {
    let slow = 0;
    const broken: DefenseState[] = [];
    this.world.state.defenses.forEach((defense) => {
      const config = DEFENSES[defense.type];
      if (!config.passable) return;
      if (!this.world.circleOverlapsDefense(zombie.x, zombie.y, zombie.radius, defense)) return;

      if (config.triggerOnContact) {
        broken.push(defense);
        return;
      }
      slow = Math.max(slow, config.slow ?? 0);
      if (config.contactWear) {
        defense.health -= config.contactWear * delta;
        defense.refund = sellValue(defense.type, defense.health, defense.maxHealth);
        if (defense.health <= 0) broken.push(defense);
      }
      if (config.contactDamage) {
        this.world.damageZombie(id, zombie, config.contactDamage * delta, defense.ownerId);
      }
    });
    for (const defense of broken) this.world.destroyDefense(defense);
    if (!this.world.state.zombies.has(id)) return false;
    zombie.speed *= Math.max(0, 1 - slow);
    return true;
  }

  /**
   * A hull is solid, and it moves: without this a driving vehicle would carry
   * the horde along inside itself instead of shoving it aside.
   */
  private pushOffVehicles() {
    if (this.world.state.vehicles.size === 0) return;
    this.world.state.zombies.forEach((zombie) => {
      this.world.state.vehicles.forEach((vehicle) => {
        if (!circleOverlapsVehicle(zombie.x, zombie.y, zombie.radius, vehicle)) return;
        const freed = pushOutOfVehicle(zombie.x, zombie.y, zombie.radius, vehicle);
        zombie.x = this.world.clamp(freed.x, 12, ARENA.width - 12);
        zombie.y = this.world.clamp(freed.y, 12, ARENA.height - 12);
      });
    });
  }

  /**
   * Being shoved into a wall would make a zombie unhittable — a bullet stops at
   * the wall in front of it — so nothing is allowed to rest inside one.
   */
  private freeFromObstacles() {
    this.world.state.zombies.forEach((zombie) => {
      for (const rect of this.world.map.obstacles) {
        if (!this.world.circleOverlapsRect(zombie.x, zombie.y, zombie.radius, rect)) continue;
        const closestX = this.world.clamp(zombie.x, rect.x - rect.w / 2, rect.x + rect.w / 2);
        const closestY = this.world.clamp(zombie.y, rect.y - rect.h / 2, rect.y + rect.h / 2);
        let offsetX = zombie.x - closestX;
        let offsetY = zombie.y - closestY;
        const distance = Math.hypot(offsetX, offsetY);
        if (distance === 0) {
          const pushX = rect.w / 2 + zombie.radius - Math.abs(zombie.x - rect.x);
          const pushY = rect.h / 2 + zombie.radius - Math.abs(zombie.y - rect.y);
          if (pushX < pushY) zombie.x += (zombie.x < rect.x ? -1 : 1) * pushX;
          else zombie.y += (zombie.y < rect.y ? -1 : 1) * pushY;
          continue;
        }
        offsetX /= distance;
        offsetY /= distance;
        zombie.x = this.world.clamp(
          zombie.x + offsetX * (zombie.radius - distance),
          12,
          ARENA.width - 12,
        );
        zombie.y = this.world.clamp(
          zombie.y + offsetY * (zombie.radius - distance),
          12,
          ARENA.height - 12,
        );
      }
    });
  }

  /**
   * Nothing may stand inside a player. The muzzle sits in front of the player,
   * so a zombie that got shoved into the own hitbox could never be shot — it
   * would just hug you until the wave stalls.
   */
  private pushOffPlayers() {
    const players = this.world.livingPlayers();
    if (players.length === 0) return;
    this.world.state.zombies.forEach((zombie) => {
      for (const player of players) {
        const dx = zombie.x - player.x;
        const dy = zombie.y - player.y;
        const distance = Math.hypot(dx, dy);
        const minimum = zombie.radius + PLAYER_RADIUS - 4;
        if (distance >= minimum) continue;
        const angle = distance < 0.01 ? zombie.rotation + Math.PI : Math.atan2(dy, dx);
        const push = minimum - distance;
        zombie.x = this.world.clamp(zombie.x + Math.cos(angle) * push, 12, ARENA.width - 12);
        zombie.y = this.world.clamp(zombie.y + Math.sin(angle) * push, 12, ARENA.height - 12);
      }
    });
  }

  private attackDelay(type: ZombieType, base: number) {
    return type === 'fast' || type === 'crawler' ? base * 0.7 : base;
  }

  private turnTowards(current: number, target: number, step: number) {
    let difference = target - current;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return current + Math.max(-step, Math.min(step, difference));
  }

  /** Heavies tear through barricades and vehicle hulls far faster than trash. */
  private structureBonus(zombie: ZombieState) {
    const rank = ZOMBIES[zombie.type].rank;
    if (rank === 'boss') return 3.4;
    if (rank === 'mini') return 2.2;
    return zombie.type === 'big' || zombie.type === 'armored' ? 1.6 : 1;
  }

  private currentSpeed(zombie: ZombieState, delta: number) {
    let speed = zombie.baseSpeed;
    if (zombie.charging > 0) {
      zombie.charging = Math.max(0, zombie.charging - delta);
      speed = zombie.chargeSpeed || zombie.baseSpeed;
    }
    if (zombie.hasteTimer > 0) {
      zombie.hasteTimer = Math.max(0, zombie.hasteTimer - delta);
      speed *= zombie.hasteFactor;
    }
    if (zombie.chilled > 0) speed *= zombie.slowFactor;
    return speed;
  }

  /** Screamers whip everything around them into a sprint. */
  private applyHaste() {
    const screamers: ZombieState[] = [];
    this.world.state.zombies.forEach((zombie) => {
      if (hasteAura(zombie.type)) screamers.push(zombie);
    });
    if (screamers.length === 0) return;
    this.world.state.zombies.forEach((zombie) => {
      for (const screamer of screamers) {
        if (screamer === zombie) continue;
        const aura = hasteAura(screamer.type);
        if (!aura) continue;
        if (Math.hypot(zombie.x - screamer.x, zombie.y - screamer.y) > aura.radius) continue;
        zombie.hasteTimer = 0.4;
        zombie.hasteFactor = aura.factor;
        return;
      }
    });
  }

  /**
   * Local steering is cheap and handles most props. If it stops making real
   * progress, a small A* grid supplies waypoints around larger formations.
   */
  private navigationTarget(zombie: ZombieState, targetX: number, targetY: number) {
    if (Math.hypot(targetX - zombie.pathTargetX, targetY - zombie.pathTargetY) > 140) {
      zombie.path = [];
    }
    zombie.pathTargetX = targetX;
    zombie.pathTargetY = targetY;

    if (
      zombie.path.length > 0 &&
      this.world.canTravel(zombie.x, zombie.y, targetX, targetY, zombie.radius)
    ) {
      zombie.path = [];
      zombie.stuckTimer = 0;
      zombie.bestDistance = Math.hypot(targetX - zombie.x, targetY - zombie.y);
    }

    while (
      zombie.path.length > 0 &&
      Math.hypot(zombie.path[0].x - zombie.x, zombie.path[0].y - zombie.y) <
        Math.max(18, zombie.radius * 0.75)
    ) {
      zombie.path.shift();
      zombie.bestDistance = Infinity;
    }

    if (zombie.path.length === 0 && zombie.stuckTimer > 1.2) {
      zombie.path = this.findPath(zombie, targetX, targetY);
      zombie.stuckTimer = 0;
      zombie.bestDistance = Infinity;
    }

    if (zombie.path.length === 0) return { x: targetX, y: targetY };

    // Skip cell-by-cell zig-zags whenever a farther waypoint is already clear.
    for (let index = zombie.path.length - 1; index > 0; index -= 1) {
      const waypoint = zombie.path[index];
      if (!this.world.canTravel(zombie.x, zombie.y, waypoint.x, waypoint.y, zombie.radius)) {
        continue;
      }
      zombie.path.splice(0, index);
      zombie.bestDistance = Infinity;
      break;
    }
    return zombie.path[0];
  }

  private findPath(zombie: ZombieState, targetX: number, targetY: number) {
    const cell = 40;
    const columns = Math.ceil(ARENA.width / cell);
    const rows = Math.ceil(ARENA.height / cell);
    const total = columns * rows;
    const pointOf = (index: number) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: this.world.clamp((column + 0.5) * cell, 12, ARENA.width - 12),
        y: this.world.clamp((row + 0.5) * cell, 12, ARENA.height - 12),
      };
    };
    const walkable = new Map<number, boolean>();
    const canUse = (index: number) => {
      const known = walkable.get(index);
      if (known !== undefined) return known;
      const point = pointOf(index);
      const value = this.world.canStand(point.x, point.y, zombie.radius + 2);
      walkable.set(index, value);
      return value;
    };
    const nearestCell = (x: number, y: number, requireConnection = false) => {
      const originColumn = this.world.clamp(Math.floor(x / cell), 0, columns - 1);
      const originRow = this.world.clamp(Math.floor(y / cell), 0, rows - 1);
      let best = -1;
      let bestDistance = Infinity;
      for (let radius = 0; radius <= 4; radius += 1) {
        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
          for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
            if (radius > 0 && Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
            const column = originColumn + offsetX;
            const row = originRow + offsetY;
            if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
            const index = row * columns + column;
            if (!canUse(index)) continue;
            const point = pointOf(index);
            if (requireConnection && !this.world.canTravel(x, y, point.x, point.y, zombie.radius)) {
              continue;
            }
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance >= bestDistance) continue;
            best = index;
            bestDistance = distance;
          }
        }
        if (best >= 0) return best;
      }
      return -1;
    };

    const start = nearestCell(zombie.x, zombie.y, true);
    const goal = nearestCell(targetX, targetY);
    if (start < 0 || goal < 0 || start === goal) return [];

    const scores = new Float64Array(total);
    scores.fill(Infinity);
    const previous = new Int32Array(total);
    previous.fill(-1);
    const closed = new Uint8Array(total);
    const heap: Array<{ index: number; score: number }> = [];
    const push = (entry: { index: number; score: number }) => {
      heap.push(entry);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        if (heap[parent].score <= entry.score) break;
        heap[child] = heap[parent];
        child = parent;
      }
      heap[child] = entry;
    };
    const pop = () => {
      const first = heap[0];
      const last = heap.pop();
      if (!last || heap.length === 0) return first;
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && heap[right].score < heap[left].score ? right : left;
        if (heap[child].score >= last.score) break;
        heap[parent] = heap[child];
        parent = child;
      }
      heap[parent] = last;
      return first;
    };
    const goalPoint = pointOf(goal);
    scores[start] = 0;
    push({
      index: start,
      score: Math.hypot(pointOf(start).x - goalPoint.x, pointOf(start).y - goalPoint.y),
    });

    const directions = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ] as const;
    while (heap.length > 0) {
      const currentEntry = pop();
      if (!currentEntry) break;
      const current = currentEntry.index;
      if (closed[current]) continue;
      if (current === goal) break;
      closed[current] = 1;
      const column = current % columns;
      const row = Math.floor(current / columns);
      const from = pointOf(current);
      for (const [offsetX, offsetY] of directions) {
        const nextColumn = column + offsetX;
        const nextRow = row + offsetY;
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
        const next = nextRow * columns + nextColumn;
        if (closed[next] || !canUse(next)) continue;
        const to = pointOf(next);
        if (!this.world.canTravel(from.x, from.y, to.x, to.y, zombie.radius + 2)) continue;
        const nextScore = scores[current] + Math.hypot(to.x - from.x, to.y - from.y);
        if (nextScore >= scores[next]) continue;
        scores[next] = nextScore;
        previous[next] = current;
        push({
          index: next,
          score: nextScore + Math.hypot(to.x - goalPoint.x, to.y - goalPoint.y),
        });
      }
    }

    if (previous[goal] < 0) return [];
    const reversed: Array<{ x: number; y: number }> = [];
    let cursor = goal;
    while (cursor >= 0) {
      reversed.push(pointOf(cursor));
      if (cursor === start) break;
      cursor = previous[cursor];
    }
    reversed.reverse();
    const last = reversed[reversed.length - 1];
    if (last && this.world.canTravel(last.x, last.y, targetX, targetY, zombie.radius)) {
      reversed.push({ x: targetX, y: targetY });
    }
    return reversed;
  }

  /**
   * Walks a zombie around map obstacles. Movement is checked in short substeps,
   * so a fast charge cannot tunnel across a thin wall between two server ticks.
   * When the direct line is blocked, stable angle sampling steers around the
   * same side until the route opens again.
   */
  private moveZombie(zombie: ZombieState, dx: number, dy: number) {
    const apply = (stepX: number, stepY: number) => {
      zombie.x = this.world.clamp(zombie.x + stepX, 12, ARENA.width - 12);
      zombie.y = this.world.clamp(zombie.y + stepY, 12, ARENA.height - 12);
    };
    const canTravel = (stepX: number, stepY: number) =>
      this.world.canTravel(zombie.x, zombie.y, zombie.x + stepX, zombie.y + stepY, zombie.radius);

    if (canTravel(dx, dy)) {
      apply(dx, dy);
      return true;
    }

    const length = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    const offsets = [15, 30, 45, 60, 75, 90, 110, 135, 160, 180];
    for (const side of [zombie.avoidSide, -zombie.avoidSide]) {
      for (const degrees of offsets) {
        const angle = desired + side * ((degrees * Math.PI) / 180);
        const stepX = Math.cos(angle) * length;
        const stepY = Math.sin(angle) * length;
        if (!canTravel(stepX, stepY)) continue;
        zombie.avoidSide = side;
        apply(stepX, stepY);
        return true;
      }
    }
    return false;
  }

  /** Keeps a horde from collapsing into a single stack of bodies. */
  private separate() {
    const zombies = [...this.world.state.zombies.values()];
    if (zombies.length < 2) return;
    const cellSize = 72;
    const grid = new Map<string, number[]>();
    zombies.forEach((zombie, index) => {
      const key = `${Math.floor(zombie.x / cellSize)}:${Math.floor(zombie.y / cellSize)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(index);
      else grid.set(key, [index]);
    });

    for (let index = 0; index < zombies.length; index += 1) {
      const zombie = zombies[index];
      const cellX = Math.floor(zombie.x / cellSize);
      const cellY = Math.floor(zombie.y / cellSize);
      let pushes = 0;
      for (let offsetX = -1; offsetX <= 1 && pushes < 4; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1 && pushes < 4; offsetY += 1) {
          const bucket = grid.get(`${cellX + offsetX}:${cellY + offsetY}`);
          if (!bucket) continue;
          for (const other of bucket) {
            if (other <= index) continue;
            const partner = zombies[other];
            const dx = partner.x - zombie.x;
            const dy = partner.y - zombie.y;
            const minimum = (zombie.radius + partner.radius) * 0.82;
            const distance = Math.hypot(dx, dy);
            if (distance >= minimum) continue;
            const push = (minimum - Math.max(distance, 0.01)) * 0.45;
            const normalX = distance < 0.01 ? Math.cos(other) : dx / distance;
            const normalY = distance < 0.01 ? Math.sin(other) : dy / distance;
            if (
              this.world.canStand(
                partner.x + normalX * push,
                partner.y + normalY * push,
                partner.radius,
              )
            ) {
              partner.x = this.world.clamp(partner.x + normalX * push, 12, ARENA.width - 12);
              partner.y = this.world.clamp(partner.y + normalY * push, 12, ARENA.height - 12);
            }
            if (
              this.world.canStand(
                zombie.x - normalX * push,
                zombie.y - normalY * push,
                zombie.radius,
              )
            ) {
              zombie.x = this.world.clamp(zombie.x - normalX * push, 12, ARENA.width - 12);
              zombie.y = this.world.clamp(zombie.y - normalY * push, 12, ARENA.height - 12);
            }
            pushes += 1;
            if (pushes >= 4) break;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------- detonation

  /**
   * An exploder that reached its target blows itself up. Nobody earns for that
   * — the money is for stopping it in time.
   */
  private detonate(zombie: ZombieState) {
    let ownId = '';
    this.world.state.zombies.forEach((candidate, id) => {
      if (candidate === zombie) ownId = id;
    });
    if (!ownId) return;
    this.world.killZombie(ownId, zombie, false);
  }

  private explode(zombie: ZombieState) {
    const config = ZOMBIES[zombie.type];
    if (!config.explode) return;
    const radius = config.explode.radius;
    const damage =
      config.explode.damage * this.world.damageScale() * this.world.endlessDamageMultiplier();
    this.world.pushFx({ k: 'explosion', x: zombie.x, y: zombie.y, r: radius, s: 'exploder' });
    this.world.blast(zombie.x, zombie.y, radius, damage);

    const victims: Array<[string, ZombieState]> = [];
    this.world.state.zombies.forEach((other, id) => {
      if (other === zombie) return;
      if (Math.hypot(other.x - zombie.x, other.y - zombie.y) <= radius + other.radius) {
        victims.push([id, other]);
      }
    });
    for (const [id, other] of victims) this.world.damageZombie(id, other, damage * 0.5, '');
  }
}
