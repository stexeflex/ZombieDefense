import {
  ARENA,
  DEFENSES,
  EMPTY_PERKS,
  EMPTY_UPGRADES,
  MAX_ACTIVE_ZOMBIES,
  PLAYER_RADIUS,
  SUMMON_CYCLES,
  ZOMBIES,
  armorReduction,
  dashReduction,
  timedAbilities,
  type FxEvent,
  type GameMap,
  type HazardKind,
  type MapObstacle,
  type PermanentPerks,
  type PermanentUpgrades,
  type PlayerInput,
  type WeaponType,
  type ZombieType,
} from '../../../shared/game-types.js';
import {
  DefenseState,
  GameState,
  HazardState,
  PlayerState,
  ProjectileState,
  ZombieState,
} from '../state/game-state.js';

export interface AmmoStore {
  ammo: number;
  reserveAmmo: number;
}

export interface RuntimePlayer {
  input: PlayerInput;
  upgrades: PermanentUpgrades;
  perks: PermanentPerks;
  grenadeRecharge: number[];
  grenadeThrowLock: number;
  /** One countdown per spent dash charge. */
  dashRecharge: number[];
  dashLock: number;
  wasDashing: boolean;
  /** Everything the running dash already cut, so nobody is hit twice. */
  dashHits: Set<string>;
  /** Magazine and spare rounds of every weapon that is not in hand. */
  stowed: Map<WeaponType, AmmoStore>;
  wasFiring: boolean;
  /** Discounted purchases the starter perks still have left this run. */
  weaponDiscounts: number;
  barricadeDiscounts: number;
  turretDiscounts: number;
  lastStandReady: boolean;
  /** Knock-back or pull a boss applied, decays on its own. */
  pushX: number;
  pushY: number;
}

const MAX_FX_PER_SNAPSHOT = 56;

export const EMPTY_INPUT: PlayerInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  reload: false,
  dash: false,
  aimX: ARENA.width / 2,
  aimY: ARENA.height / 2,
};

/**
 * Everything the systems share: the authoritative state, the map, per player
 * runtime data and the maths they all need. Systems stay small because the
 * bookkeeping lives here.
 */
export class GameWorld {
  readonly runtime = new Map<string, RuntimePlayer>();
  fxQueue: FxEvent[] = [];
  private entityCounter = 0;

  constructor(
    public state: GameState,
    public map: GameMap,
  ) {}

  // ------------------------------------------------------------------ basics

  clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  nextId(prefix: string) {
    this.entityCounter += 1;
    return `${prefix}${this.entityCounter}`;
  }

  pushFx(event: FxEvent) {
    if (this.fxQueue.length >= MAX_FX_PER_SNAPSHOT) return;
    this.fxQueue.push({
      ...event,
      x: Math.round(event.x),
      y: Math.round(event.y),
      x2: event.x2 === undefined ? undefined : Math.round(event.x2),
      y2: event.y2 === undefined ? undefined : Math.round(event.y2),
    });
  }

  upgradesOf(sessionId: string) {
    return this.runtime.get(sessionId)?.upgrades ?? EMPTY_UPGRADES;
  }

  perksOf(sessionId: string) {
    return this.runtime.get(sessionId)?.perks ?? EMPTY_PERKS;
  }

  /**
   * Enemy health scales with the full map difficulty, damage only with part of
   * it and capped — otherwise the last maps one-shot anyone who has not farmed
   * upgrades for hours.
   */
  damageScale() {
    return Math.min(5.2, 1 + (this.map.difficulty - 1) * 0.7);
  }

  waveDamageScale() {
    return 1 + Math.min(0.5, Math.max(0, this.state.wave - 1) * 0.025);
  }

  // ----------------------------------------------------------------- spawning

  spawnZombie(type: ZombieType, at?: { x: number; y: number }) {
    const config = ZOMBIES[type];
    const zombie = new ZombieState();
    zombie.id = this.nextId('z');
    zombie.type = type;
    const spawn = at ?? this.edgeSpawn(config.radius);
    zombie.x = spawn.x;
    zombie.y = spawn.y;
    const waveScale = 1 + Math.max(0, this.state.wave - 1) * 0.07;
    zombie.maxHealth = Math.round(config.health * waveScale * this.map.difficulty);
    zombie.health = zombie.maxHealth;
    zombie.baseSpeed = config.speed * (1 + Math.min(0.3, this.state.wave * 0.012));
    zombie.speed = zombie.baseSpeed;
    zombie.damage = config.damage * this.damageScale() * this.waveDamageScale();
    zombie.radius = config.radius;
    zombie.reward = config.reward;
    zombie.armor = config.armor ?? 0;
    // Abilities start part way through their cycle so a fresh boss does not
    // dump everything the second it appears.
    const abilities = timedAbilities(type);
    zombie.abilityTimers = abilities.map((ability) => ability.every * (0.55 + Math.random() * 0.3));
    // A summoner runs dry eventually, so no wave can be kept alive forever by
    // an enemy that calls in reinforcements faster than they can be cleared.
    zombie.abilityBudget = abilities.map((ability) =>
      ability.kind === 'summon' ? ability.count * SUMMON_CYCLES : Infinity,
    );
    this.state.zombies.set(zombie.id, zombie);
    if (config.rank === 'boss' || config.rank === 'mini') {
      this.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'spawn' });
    }
    return zombie;
  }

  spawnHazard(options: {
    kind: HazardKind;
    x: number;
    y: number;
    r: number;
    life: number;
    damage: number;
    ownerId?: string;
  }) {
    const hazard = new HazardState();
    hazard.id = this.nextId('h');
    hazard.kind = options.kind;
    hazard.x = Math.round(this.clamp(options.x, 20, ARENA.width - 20));
    hazard.y = Math.round(this.clamp(options.y, 20, ARENA.height - 20));
    hazard.r = Math.round(options.r);
    hazard.life = options.life;
    hazard.maxLife = options.life;
    hazard.damage = options.damage;
    hazard.ownerId = options.ownerId ?? '';
    this.state.hazards.set(hazard.id, hazard);
    return hazard;
  }

  createProjectile(
    ownerId: string,
    x: number,
    y: number,
    angle: number,
    damage: number,
    speed: number,
    kind: string,
  ) {
    const projectile = new ProjectileState();
    projectile.id = this.nextId('p');
    projectile.ownerId = ownerId;
    projectile.kind = kind;
    projectile.x = x;
    projectile.y = y;
    projectile.vx = Math.cos(angle) * speed;
    projectile.vy = Math.sin(angle) * speed;
    projectile.damage = damage;
    projectile.life = 1.2;
    this.state.projectiles.set(projectile.id, projectile);
    return projectile;
  }

  atZombieCap() {
    return this.state.zombies.size >= MAX_ACTIVE_ZOMBIES;
  }

  playerSpawn(index: number) {
    const angle = (Math.PI * 2 * index) / 4;
    return {
      x: ARENA.width / 2 + Math.cos(angle) * 70,
      y: ARENA.height / 2 + Math.sin(angle) * 70,
    };
  }

  /**
   * Enemies enter from just outside the arena. Prefer an entry lane without
   * buildings or players, so every corner remains useful for defenses and no
   * enemy appears inside somebody's fortification.
   */
  edgeSpawn(radius = ZOMBIES.normal.radius) {
    const randomCandidate = () =>
      this.edgeSpawnCandidate(Math.floor(Math.random() * 4), Math.random(), radius);

    const start = Math.floor(Math.random() * 64);
    for (const avoidPlayers of [true, false]) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = randomCandidate();
        if (this.spawnLaneClear(candidate, radius, avoidPlayers)) return candidate;
      }
      // A fixed sweep catches narrow free gaps that the random attempts missed.
      for (let index = 0; index < 64; index += 1) {
        const slot = (start + index * 17) % 64;
        const candidate = this.edgeSpawnCandidate(
          Math.floor(slot / 16),
          ((slot % 16) + 0.5) / 16,
          radius,
        );
        if (this.spawnLaneClear(candidate, radius, avoidPlayers)) return candidate;
      }
    }

    // Even a completely walled-off edge must not freeze a wave. Spawning just
    // outside lets that enemy attack its way through instead of overlapping it.
    return randomCandidate();
  }

  private edgeSpawnCandidate(side: number, offset: number, radius: number) {
    const outside = radius + 24;
    const edgeMargin = 50;
    const vertical = edgeMargin + offset * (ARENA.height - edgeMargin * 2);
    const horizontal = edgeMargin + offset * (ARENA.width - edgeMargin * 2);
    if (side === 0) return { x: -outside, y: vertical };
    if (side === 1) return { x: ARENA.width + outside, y: vertical };
    if (side === 2) return { x: horizontal, y: -outside };
    return { x: horizontal, y: ARENA.height + outside };
  }

  private spawnLaneClear(
    candidate: { x: number; y: number },
    radius: number,
    avoidPlayers: boolean,
  ) {
    const entryX = this.clamp(candidate.x, 12, ARENA.width - 12);
    const entryY = this.clamp(candidate.y, 12, ARENA.height - 12);
    if (!this.canStand(entryX, entryY, radius + 10)) return false;
    for (const defense of this.state.defenses.values()) {
      if (this.circleOverlapsDefense(entryX, entryY, radius + 18, defense)) return false;
    }
    if (!avoidPlayers) return true;
    return this.livingPlayers().every(
      (player) =>
        Math.hypot(player.x - entryX, player.y - entryY) >=
        radius + PLAYER_RADIUS + 180,
    );
  }

  // ------------------------------------------------------------------- damage

  igniteZombie(zombie: ZombieState, dps: number, seconds: number, ownerId: string) {
    zombie.burnDps = Math.max(zombie.burnDps, dps);
    zombie.burning = Math.max(zombie.burning, seconds);
    if (ownerId) zombie.lastAttacker = ownerId;
  }

  /**
   * Frost stacks by strength, not by count: the hardest slow wins and refreshes
   * the timer, so emptying a magazine cannot freeze a horde in place forever.
   */
  chillZombie(zombie: ZombieState, slow: number, seconds: number) {
    const factor = 1 - slow;
    zombie.slowFactor = zombie.chilled > 0 ? Math.min(zombie.slowFactor, factor) : factor;
    zombie.chilled = Math.max(zombie.chilled, seconds);
  }

  damageZombie(id: string, zombie: ZombieState, amount: number, ownerId: string) {
    const dealt = Math.max(0, amount * (1 - zombie.armor));
    zombie.health -= dealt;
    if (ownerId && this.state.players.has(ownerId)) {
      zombie.damageBy.set(ownerId, (zombie.damageBy.get(ownerId) ?? 0) + dealt);
      zombie.lastAttacker = ownerId;
    }
    if (zombie.health <= 0) this.killZombie(id, zombie);
  }

  healZombie(zombie: ZombieState, amount: number) {
    zombie.health = Math.min(zombie.maxHealth, zombie.health + amount);
  }

  /** `payout` is off when a zombie removes itself, e.g. an exploder on impact. */
  killZombie(id: string, zombie: ZombieState, payout = true) {
    if (!this.state.zombies.has(id)) return;
    this.state.zombies.delete(id);
    this.pushFx({ k: 'death', x: zombie.x, y: zombie.y, r: zombie.radius, s: zombie.type });
    if (payout) this.payKill(zombie);
    this.onZombieKilled?.(zombie);
  }

  /** Set by the zombie system so a dying enemy can explode or split. */
  onZombieKilled?: (zombie: ZombieState) => void;

  /**
   * The whole reward is split evenly, no matter who shot: someone who only
   * builds barricades or patches up the squad earns exactly as much as the one
   * behind the gun.
   */
  private payKill(zombie: ZombieState) {
    const players = [...this.state.players.values()];
    if (players.length === 0) return;
    const share = Math.round((zombie.reward * this.map.moneyScale) / players.length);

    let bestId = '';
    let bestDamage = 0;
    for (const player of players) {
      player.money += share;
      const dealt = zombie.damageBy.get(player.id) ?? 0;
      if (dealt > bestDamage) {
        bestDamage = dealt;
        bestId = player.id;
      }
    }
    // The kill goes on the account of whoever hurt it most, not the last shot.
    const scorer = bestId ? this.state.players.get(bestId) : undefined;
    if (scorer) scorer.kills += 1;
  }

  /** Tells the caller whether the blow landed, so a dodge can look different. */
  damagePlayer(player: PlayerState, amount: number) {
    if (!player.alive) return false;
    const runtime = this.runtime.get(player.id);
    const upgrades = runtime?.upgrades ?? EMPTY_UPGRADES;
    let reduction = 1 - armorReduction(upgrades.armor);
    // A dash swallows a good part of every blow, and the levelled upgrade pushes
    // that up to the full immunity it used to hand out for nothing.
    if (player.dashing > 0) {
      const dodged = dashReduction(upgrades.dashResist);
      if (dodged >= 1) return false;
      reduction *= 1 - dodged;
    }
    let incoming = amount * reduction;
    player.hurt = 0.35;
    // The dash shield takes the blow first, only the rest reaches the body.
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, incoming);
      player.shield -= absorbed;
      incoming -= absorbed;
    }
    const next = player.health - incoming;
    if (next <= 0 && runtime?.perks.lastStand && runtime.lastStandReady) {
      runtime.lastStandReady = false;
      player.health = 1;
      this.pushFx({ k: 'heal', x: player.x, y: player.y, s: 'laststand' });
      return true;
    }
    player.health = Math.max(0, next);
    if (player.health <= 0) {
      player.alive = false;
      player.reviveProgress = 0;
      this.pushFx({ k: 'blood', x: player.x, y: player.y, r: 40, s: 'down' });
    }
    return true;
  }

  damageStructures(x: number, y: number, radius: number, damage: number) {
    const broken: DefenseState[] = [];
    this.state.defenses.forEach((defense) => {
      const distance = Math.hypot(defense.x - x, defense.y - y);
      if (distance > radius) return;
      defense.health -= damage * Math.max(0.3, 1 - distance / radius);
      this.pushFx({ k: 'structure', x: defense.x, y: defense.y, s: defense.type });
      if (defense.health <= 0) broken.push(defense);
    });
    for (const defense of broken) {
      this.pushFx({ k: 'wreck', x: defense.x, y: defense.y, s: defense.type });
      this.state.defenses.delete(defense.id);
    }
  }

  /** Area hit that catches players and their buildings alike. */
  blast(x: number, y: number, radius: number, damage: number, structureFactor = 1.2) {
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance > radius) return;
      this.damagePlayer(player, damage * Math.max(0.35, 1 - distance / radius));
    });
    this.damageStructures(x, y, radius, damage * structureFactor);
  }

  // ------------------------------------------------------------------ lookups

  nearestLivingPlayer(x: number, y: number) {
    let best: PlayerState | undefined;
    let bestDistance = Infinity;
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    });
    return best;
  }

  livingPlayers() {
    return [...this.state.players.values()].filter((player) => player.alive);
  }

  nearestZombie(x: number, y: number, range: number, requireSight = false) {
    let best: ZombieState | undefined;
    let bestDistance = range;
    this.state.zombies.forEach((zombie) => {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance > bestDistance) return;
      if (requireSight && !this.hasLineOfSight(x, y, zombie.x, zombie.y)) return;
      bestDistance = distance;
      best = zombie;
    });
    return best;
  }

  everyoneReady() {
    return (
      this.state.players.size > 0 &&
      [...this.state.players.values()].every((player) => player.ready)
    );
  }

  // --------------------------------------------------------------- collisions

  canStand(x: number, y: number, radius: number) {
    for (const obstacle of this.map.obstacles) {
      if (this.circleOverlapsRect(x, y, radius, obstacle)) return false;
    }
    return true;
  }

  circleOverlapsRect(x: number, y: number, radius: number, rect: MapObstacle) {
    const closestX = this.clamp(x, rect.x - rect.w / 2, rect.x + rect.w / 2);
    const closestY = this.clamp(y, rect.y - rect.h / 2, rect.y + rect.h / 2);
    return Math.hypot(x - closestX, y - closestY) < radius;
  }

  circleOverlapsDefense(x: number, y: number, radius: number, defense: DefenseState) {
    const config = DEFENSES[defense.type];
    if (config.kind === 'turret') {
      return Math.hypot(x - defense.x, y - defense.y) < radius + config.width / 2 - 4;
    }
    const cos = Math.cos(-defense.rotation);
    const sin = Math.sin(-defense.rotation);
    const dx = x - defense.x;
    const dy = y - defense.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const closestX = this.clamp(localX, -config.width / 2, config.width / 2);
    const closestY = this.clamp(localY, -config.height / 2, config.height / 2);
    return Math.hypot(localX - closestX, localY - closestY) < radius;
  }

  blockingDefense(zombie: ZombieState, dx: number, dy: number) {
    return [...this.state.defenses.values()].find((defense) =>
      this.circleOverlapsDefense(zombie.x + dx, zombie.y + dy, zombie.radius, defense),
    );
  }

  /**
   * How far along the segment a circle is met, as a share of its length, or
   * undefined when it is missed. Used to sort what a bullet meets first.
   */
  segmentCircleAt(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    radius: number,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(cx - x1, cy - y1) <= radius ? 0 : undefined;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lengthSquared;
    t = this.clamp(t, 0, 1);
    const distance = Math.hypot(cx - (x1 + dx * t), cy - (y1 + dy * t));
    return distance <= radius ? t : undefined;
  }

  segmentHitsCircle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    radius: number,
  ) {
    return this.segmentCircleAt(x1, y1, x2, y2, cx, cy, radius) !== undefined;
  }

  /** Same idea for walls: where the segment first enters a solid obstacle. */
  obstacleHitAt(x1: number, y1: number, x2: number, y2: number) {
    let best: number | undefined;
    for (const rect of this.map.obstacles) {
      if (!rect.solid) continue;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (
        maxX < rect.x - rect.w / 2 ||
        minX > rect.x + rect.w / 2 ||
        maxY < rect.y - rect.h / 2 ||
        minY > rect.y + rect.h / 2
      ) {
        continue;
      }
      const at = this.segmentEntersRect(x1, y1, x2, y2, rect);
      if (at === undefined) continue;
      if (best === undefined || at < best) best = at;
    }
    return best;
  }

  segmentHitsObstacle(x1: number, y1: number, x2: number, y2: number) {
    return this.obstacleHitAt(x1, y1, x2, y2) !== undefined;
  }

  private segmentEntersRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rect: MapObstacle,
  ) {
    const left = rect.x - rect.w / 2;
    const right = rect.x + rect.w / 2;
    const top = rect.y - rect.h / 2;
    const bottom = rect.y + rect.h / 2;
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return 0;

    let tMin = 0;
    let tMax = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const slabs: Array<[number, number, number]> = [
      [dx, left - x1, right - x1],
      [dy, top - y1, bottom - y1],
    ];
    for (const [delta, near, far] of slabs) {
      if (Math.abs(delta) < 1e-6) {
        if (near > 0 || far < 0) return undefined;
        continue;
      }
      let t1 = near / delta;
      let t2 = far / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return undefined;
    }
    return tMin;
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number) {
    return !this.segmentHitsObstacle(x1, y1, x2, y2);
  }
}
