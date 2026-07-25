import type { Client } from 'colyseus';
import { Room } from 'colyseus';
import {
  ARENA,
  BUILD_SECONDS,
  DEFAULT_MAP_ID,
  DEFENSES,
  EMPTY_UPGRADES,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  START_MONEY,
  WEAPONS,
  ZOMBIES,
  findMap,
  weaponLife,
  type DefenseType,
  type FxEvent,
  type GameMap,
  type MapObstacle,
  type PermanentUpgrades,
  type PlayerInput,
  type WeaponType,
  type ZombieType,
} from '../../../shared/game-types.js';
import {
  DefenseState,
  GameState,
  PlayerState,
  ProjectileState,
  ZombieState,
} from '../state/game-state.js';

interface JoinOptions {
  lobbyCode?: string;
  name?: string;
  mapId?: string;
  upgrades?: Partial<PermanentUpgrades>;
}

interface RuntimePlayer {
  input: PlayerInput;
  upgrades: PermanentUpgrades;
  grenadeRecharge: number[];
  grenadeThrowLock: number;
}

const COLORS = ['#69f0ae', '#57b8ff', '#ffcc66', '#ff6b8a'];
const EMPTY_INPUT: PlayerInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  reload: false,
  aimX: ARENA.width / 2,
  aimY: ARENA.height / 2,
};

const MAX_ACTIVE_ZOMBIES = 95;
const MAX_FX_PER_SNAPSHOT = 48;

const PLAYER_PRECISION: Record<string, number> = {
  x: 10,
  y: 10,
  rotation: 1000,
  health: 1,
  reviveProgress: 100,
  reloading: 100,
  grenadeCooldown: 10,
  firing: 100,
  hurt: 100,
  money: 1,
};
const ZOMBIE_PRECISION: Record<string, number> = {
  x: 10,
  y: 10,
  rotation: 100,
  health: 1,
  maxHealth: 1,
  burning: 10,
  attacking: 100,
  charging: 100,
};
const PROJECTILE_PRECISION: Record<string, number> = { x: 10, y: 10, vx: 1, vy: 1 };
const DEFENSE_PRECISION: Record<string, number> = {
  x: 1,
  y: 1,
  rotation: 100,
  health: 1,
  maxHealth: 1,
};

export class ZombieRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  private runtimePlayers = new Map<string, RuntimePlayer>();
  private spawnQueue: ZombieType[] = [];
  private spawnDelay = 0;
  private entityCounter = 0;
  private runId = '';
  private snapshotElapsed = 0;
  private fxQueue: FxEvent[] = [];
  private map: GameMap = findMap(DEFAULT_MAP_ID);

  onCreate(options: JoinOptions) {
    const state = new GameState();
    state.lobbyCode = this.cleanCode(options.lobbyCode);
    this.setState(state);
    this.applyMap(options.mapId ?? DEFAULT_MAP_ID);
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 50);

    this.onMessage('input', (client, input: Partial<PlayerInput>) => {
      const runtime = this.runtimePlayers.get(client.sessionId);
      if (!runtime) return;
      runtime.input = this.cleanInput(input);
    });
    this.onMessage('select_map', (client, mapId: string) => {
      if (client.sessionId !== this.state.hostSessionId) return;
      if (this.state.phase !== 'lobby' && this.state.phase !== 'gameover') return;
      this.applyMap(mapId);
      this.broadcastSnapshot();
    });
    this.onMessage('start', (client) => {
      if (client.sessionId === this.state.hostSessionId && this.state.phase === 'lobby') {
        this.startRun();
      }
    });
    this.onMessage('restart', (client) => {
      if (client.sessionId === this.state.hostSessionId && this.state.phase === 'gameover') {
        this.startRun();
      }
    });
    this.onMessage('ready', (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (player && this.state.phase === 'build') player.ready = Boolean(ready);
      if (this.state.phase === 'build' && this.everyoneReady()) this.startNextWave();
    });
    this.onMessage('buy_weapon', (client, weapon: WeaponType) =>
      this.buyWeapon(client.sessionId, weapon),
    );
    this.onMessage('buy_ammo', (client) => this.buyAmmo(client.sessionId));
    this.onMessage('buy_heal', (client) => this.buyHeal(client.sessionId));
    this.onMessage(
      'place',
      (client, payload: { type?: DefenseType; x?: number; y?: number; rotation?: number }) =>
        this.placeDefense(client.sessionId, payload),
    );
    this.onMessage('sell', (client) => this.sellNearest(client.sessionId));
    this.onMessage('repair', (client) => this.repairNearest(client.sessionId));
    this.onMessage('grenade', (client, target: { x?: number; y?: number }) =>
      this.throwGrenade(client.sessionId, target),
    );
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = this.cleanName(options.name);
    player.color = COLORS[this.state.players.size % COLORS.length];
    const spawn = this.playerSpawn(this.state.players.size);
    player.x = spawn.x;
    player.y = spawn.y;
    const upgrades = this.cleanUpgrades(options.upgrades);
    player.maxHealth = Math.round(100 * (1 + upgrades.maxHealth * 0.02));
    player.health = player.maxHealth;
    player.money = START_MONEY;
    player.ammo = this.magazineSize('pistol', upgrades);
    player.reserveAmmo = WEAPONS.pistol.reserve;

    this.state.players.set(client.sessionId, player);
    this.runtimePlayers.set(client.sessionId, {
      input: { ...EMPTY_INPUT },
      upgrades,
      grenadeRecharge: [],
      grenadeThrowLock: 0,
    });
    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
    this.broadcastSnapshot();
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.runtimePlayers.delete(client.sessionId);
    if (this.state.hostSessionId === client.sessionId) {
      this.state.hostSessionId = this.state.players.keys().next().value ?? '';
    }
    if (this.state.phase === 'combat') this.checkDefeat();
  }

  // ---------------------------------------------------------------- map setup

  private applyMap(mapId: string) {
    this.map = findMap(mapId);
    this.state.mapId = this.map.id;
    this.state.totalWaves = this.map.waves.length;
    if (this.state.phase === 'lobby') {
      this.state.statusText = `${this.map.name} · ${this.map.waves.length} Wellen`;
    }
  }

  // ------------------------------------------------------------ simulation

  private update(deltaMs: number) {
    const delta = Math.min(deltaMs, 100) / 1000;
    if (this.state.phase === 'combat') this.updateCombat(delta);
    if (this.state.phase === 'build') this.updateBuild(delta);

    this.snapshotElapsed += deltaMs;
    // Big hordes push a lot of JSON, so send slightly fewer frames then and let
    // the client interpolate the gap.
    const snapshotInterval =
      this.state.phase === 'combat' ? (this.state.zombies.size > 55 ? 100 : 75) : 150;
    if (this.snapshotElapsed >= snapshotInterval) {
      this.snapshotElapsed %= snapshotInterval;
      this.broadcastSnapshot();
    }
  }

  private updateCombat(delta: number) {
    this.spawnZombies(delta);
    this.updatePlayers(delta);
    this.updateZombies(delta);
    this.updateProjectiles(delta);
    this.updateTurrets(delta);
    this.updateRevives(delta);
    this.updateBossBar();
    this.state.enemiesRemaining = this.spawnQueue.length + this.state.zombies.size;

    if (!this.checkDefeat() && this.spawnQueue.length === 0 && this.state.zombies.size === 0) {
      this.finishWave();
    }
  }

  private updateBuild(delta: number) {
    this.updatePlayers(delta);
    this.state.nextWaveIn = Math.max(0, this.state.nextWaveIn - delta);
    if (this.state.nextWaveIn <= 0) this.startNextWave();
  }

  private updatePlayers(delta: number) {
    this.state.players.forEach((player, sessionId) => {
      const runtime = this.runtimePlayers.get(sessionId);
      if (!runtime) return;
      player.fireCooldown = Math.max(-0.1, player.fireCooldown - delta);
      player.firing = Math.max(0, player.firing - delta);
      player.hurt = Math.max(0, player.hurt - delta);
      runtime.grenadeThrowLock = Math.max(0, runtime.grenadeThrowLock - delta);
      runtime.grenadeRecharge = runtime.grenadeRecharge
        .map((timer) => timer - delta)
        .sort((a, b) => a - b);
      while (runtime.grenadeRecharge.length > 0 && runtime.grenadeRecharge[0] <= 0 && player.grenades < 3) {
        runtime.grenadeRecharge.shift();
        player.grenades += 1;
      }
      player.grenadeCooldown =
        player.grenades >= 3 || runtime.grenadeRecharge.length === 0
          ? 0
          : Math.max(0, runtime.grenadeRecharge[0]);

      if (player.reloading > 0) {
        player.reloading = Math.max(0, player.reloading - delta);
        if (player.reloading === 0) this.completeReload(player, runtime.upgrades);
      }
      if (!player.alive) return;

      const input = runtime.input;
      let dx = Number(input.right) - Number(input.left);
      let dy = Number(input.down) - Number(input.up);
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      const speed = PLAYER_BASE_SPEED * (1 + runtime.upgrades.moveSpeed * 0.02);
      player.x = this.clamp(player.x + dx * speed * delta, ARENA.padding, ARENA.width - ARENA.padding);
      player.y = this.clamp(player.y + dy * speed * delta, ARENA.padding, ARENA.height - ARENA.padding);
      this.resolvePlayerObstacleCollision(player);
      this.resolvePlayerDefenseCollision(player);

      player.rotation = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      if (this.state.phase === 'combat' && input.reload && player.reloading === 0) {
        this.beginReload(player, runtime.upgrades);
      }
      if (this.state.phase === 'combat' && input.shoot && player.reloading === 0) {
        this.shoot(player, runtime.upgrades);
      }
      if (this.state.phase === 'combat' && player.ammo <= 0 && player.reloading === 0) {
        if (player.reserveAmmo <= 0) this.fallBackToPistol(player);
        this.beginReload(player, runtime.upgrades);
      }
    });
  }

  private updateZombies(delta: number) {
    const exploding: ZombieState[] = [];

    this.state.zombies.forEach((zombie, id) => {
      const config = ZOMBIES[zombie.type];
      zombie.attackCooldown = Math.max(0, zombie.attackCooldown - delta);
      zombie.attacking = Math.max(0, zombie.attacking - delta);

      if (zombie.burning > 0) {
        zombie.burning = Math.max(0, zombie.burning - delta);
        zombie.health -= zombie.burnDps * delta;
        if (zombie.health <= 0) {
          this.killZombie(id, zombie, zombie.lastAttacker);
          return;
        }
      }
      if (zombie.slowTimer > 0) zombie.slowTimer = Math.max(0, zombie.slowTimer - delta);

      let speed = zombie.baseSpeed;
      if (zombie.charging > 0) {
        zombie.charging = Math.max(0, zombie.charging - delta);
        speed = config.charge ? config.charge.speed : zombie.baseSpeed;
      } else if (config.charge) {
        zombie.chargeTimer -= delta;
        if (zombie.chargeTimer <= 0) {
          zombie.charging = config.charge.duration;
          zombie.chargeTimer = config.charge.every;
          this.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'charge' });
        }
      }
      if (zombie.slowTimer > 0) speed *= zombie.slowFactor;
      zombie.speed = speed;

      if (config.slam) {
        zombie.slamTimer -= delta;
        if (zombie.slamTimer <= 0) {
          zombie.slamTimer = config.slam.every;
          this.bossSlam(zombie, config.slam.radius, config.slam.damage);
        }
      }
      if (config.summon) {
        zombie.summonTimer -= delta;
        if (zombie.summonTimer <= 0) {
          zombie.summonTimer = config.summon.every;
          this.bossSummon(zombie, config.summon.count, config.summon.type);
        }
      }

      const target = this.nearestLivingPlayer(zombie.x, zombie.y);
      if (!target) return;

      const angle = Math.atan2(target.y - zombie.y, target.x - zombie.x);
      zombie.rotation = angle;
      const contact = zombie.radius + PLAYER_RADIUS;
      const distance = Math.hypot(target.x - zombie.x, target.y - zombie.y);
      const stepX = Math.cos(angle) * zombie.speed * delta;
      const stepY = Math.sin(angle) * zombie.speed * delta;
      const blocking = this.blockingDefense(zombie, stepX, stepY);

      if (blocking) {
        if (zombie.attackCooldown <= 0) {
          const defenseConfig = DEFENSES[blocking.type];
          const bonus = config.rank === 'boss' ? 3.4 : config.rank === 'mini' ? 2.2 : zombie.type === 'big' ? 1.6 : 1;
          blocking.health -= zombie.damage * bonus;
          zombie.attackCooldown = zombie.type === 'fast' ? 0.6 : 0.85;
          zombie.attacking = 0.3;
          this.pushFx({ k: 'structure', x: blocking.x, y: blocking.y, s: blocking.type });
          if (defenseConfig.thorns) {
            zombie.health -= defenseConfig.thorns;
            this.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: 'spike' });
            if (zombie.health <= 0) {
              this.killZombie(id, zombie, blocking.ownerId);
              return;
            }
          }
          if (defenseConfig.slow) {
            zombie.slowTimer = 1.2;
            zombie.slowFactor = 1 - defenseConfig.slow;
          }
          if (blocking.health <= 0) {
            this.pushFx({ k: 'wreck', x: blocking.x, y: blocking.y, s: blocking.type });
            this.state.defenses.delete(blocking.id);
          }
        }
        zombie.stuckTimer = 0;
        zombie.bestDistance = distance;
      } else if (distance > contact) {
        this.moveZombie(zombie, stepX, stepY, target.x, target.y);
        // Sliding along a wall can loop forever, so track real progress instead
        // of "did it move at all".
        if (distance < zombie.bestDistance - 3 || distance > zombie.bestDistance + 400) {
          zombie.bestDistance = distance;
          zombie.stuckTimer = 0;
        } else {
          zombie.stuckTimer += delta;
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
          zombie.attackCooldown = zombie.type === 'fast' ? 0.7 : 1;
          zombie.attacking = 0.3;
          this.damagePlayer(target, zombie.damage);
          this.pushFx({ k: 'blood', x: target.x, y: target.y, s: 'player' });
        }
      }
    });

    for (const zombie of exploding) this.explodeZombie(zombie);
    this.separateZombies();
  }

  /**
   * Walks a zombie around map obstacles. Sliding along a wall can dead-end in a
   * corner, so a zombie that has been stuck for a while simply walks through.
   */
  private moveZombie(
    zombie: ZombieState,
    dx: number,
    dy: number,
    targetX: number,
    targetY: number,
  ) {
    const apply = (stepX: number, stepY: number) => {
      zombie.x = this.clamp(zombie.x + stepX, 12, ARENA.width - 12);
      zombie.y = this.clamp(zombie.y + stepY, 12, ARENA.height - 12);
    };

    if (zombie.stuckTimer > 3) {
      apply(dx, dy);
      return true;
    }
    if (this.canStand(zombie.x + dx, zombie.y + dy, zombie.radius)) {
      apply(dx, dy);
      return true;
    }
    if (this.canStand(zombie.x + dx, zombie.y, zombie.radius)) {
      apply(dx, 0);
      return true;
    }
    if (this.canStand(zombie.x, zombie.y + dy, zombie.radius)) {
      apply(0, dy);
      return true;
    }

    const options: Array<[number, number]> = [
      [dy, -dx],
      [-dy, dx],
    ];
    options.sort(
      (a, b) =>
        Math.hypot(targetX - (zombie.x + a[0]), targetY - (zombie.y + a[1])) -
        Math.hypot(targetX - (zombie.x + b[0]), targetY - (zombie.y + b[1])),
    );
    for (const [slideX, slideY] of options) {
      if (this.canStand(zombie.x + slideX * 1.4, zombie.y + slideY * 1.4, zombie.radius)) {
        apply(slideX * 1.4, slideY * 1.4);
        return true;
      }
    }
    return false;
  }

  /** Keeps a horde from collapsing into a single stack of bodies. */
  private separateZombies() {
    const zombies = [...this.state.zombies.values()];
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
            if (this.canStand(partner.x + normalX * push, partner.y + normalY * push, partner.radius)) {
              partner.x = this.clamp(partner.x + normalX * push, 12, ARENA.width - 12);
              partner.y = this.clamp(partner.y + normalY * push, 12, ARENA.height - 12);
            }
            if (this.canStand(zombie.x - normalX * push, zombie.y - normalY * push, zombie.radius)) {
              zombie.x = this.clamp(zombie.x - normalX * push, 12, ARENA.width - 12);
              zombie.y = this.clamp(zombie.y - normalY * push, 12, ARENA.height - 12);
            }
            pushes += 1;
            if (pushes >= 4) break;
          }
        }
      }
    }
  }

  private updateProjectiles(delta: number) {
    const expired: string[] = [];
    this.state.projectiles.forEach((projectile, id) => {
      projectile.life -= delta;
      const fromX = projectile.x;
      const fromY = projectile.y;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;

      if (
        projectile.life <= 0 ||
        projectile.x < 0 ||
        projectile.x > ARENA.width ||
        projectile.y < 0 ||
        projectile.y > ARENA.height
      ) {
        if (projectile.splashRadius > 0) this.detonate(projectile, projectile.x, projectile.y);
        expired.push(id);
        return;
      }

      const wall = this.segmentHitsObstacle(fromX, fromY, projectile.x, projectile.y);
      if (wall) {
        if (projectile.splashRadius > 0) this.detonate(projectile, projectile.x, projectile.y);
        else this.pushFx({ k: 'hit', x: projectile.x, y: projectile.y, s: 'wall' });
        expired.push(id);
        return;
      }

      for (const [zombieId, zombie] of this.state.zombies.entries()) {
        if (projectile.hitIds.has(zombieId)) continue;
        if (
          !this.segmentHitsCircle(
            fromX,
            fromY,
            projectile.x,
            projectile.y,
            zombie.x,
            zombie.y,
            zombie.radius + projectile.radius,
          )
        ) {
          continue;
        }

        projectile.hitIds.add(zombieId);
        if (projectile.splashRadius > 0) {
          this.detonate(projectile, zombie.x, zombie.y);
          expired.push(id);
          break;
        }

        this.pushFx({ k: 'hit', x: zombie.x, y: zombie.y, s: projectile.kind });
        if (projectile.burn > 0) {
          this.igniteZombie(zombie, projectile.burn, projectile.burnSeconds, projectile.ownerId);
        }
        this.damageZombie(zombieId, zombie, projectile.damage, projectile.ownerId);

        if (projectile.chain > 0) {
          this.chainLightning(projectile, zombie, zombieId);
          expired.push(id);
          break;
        }
        if (projectile.pierce <= 0) {
          expired.push(id);
          break;
        }
        projectile.pierce -= 1;
      }
    });
    expired.forEach((id) => this.state.projectiles.delete(id));
  }

  private updateTurrets(delta: number) {
    this.state.defenses.forEach((defense) => {
      const config = DEFENSES[defense.type];
      if (config.kind !== 'turret') return;
      defense.cooldown = Math.max(0, defense.cooldown - delta);
      const target = this.nearestZombie(defense.x, defense.y, config.range ?? 380, true);
      if (!target) return;
      defense.rotation = Math.atan2(target.y - defense.y, target.x - defense.x);
      if (defense.cooldown > 0) return;

      const upgrades = this.runtimePlayers.get(defense.ownerId)?.upgrades ?? EMPTY_UPGRADES;
      const damage = (config.damage ?? 10) * (1 + upgrades.turretDamage * 0.02);
      const projectile = this.createProjectile(
        defense.ownerId,
        defense.x + Math.cos(defense.rotation) * 26,
        defense.y + Math.sin(defense.rotation) * 26,
        defense.rotation,
        damage,
        config.speed ?? 800,
        `turret_${defense.type}`,
      );
      projectile.pierce = config.pierce ?? 0;
      projectile.life = (config.range ?? 380) / (config.speed ?? 800);
      if (config.splashRadius) {
        projectile.splashRadius = config.splashRadius;
        projectile.splashDamage = (config.splashDamage ?? 0) * (1 + upgrades.turretDamage * 0.02);
        projectile.radius = 7;
      }
      defense.cooldown = config.fireDelay ?? 0.25;
      this.pushFx({
        k: 'muzzle',
        x: defense.x + Math.cos(defense.rotation) * 26,
        y: defense.y + Math.sin(defense.rotation) * 26,
        a: defense.rotation,
        s: defense.type,
      });
    });
  }

  private updateRevives(delta: number) {
    this.state.players.forEach((downed) => {
      if (downed.alive) return;
      const rescuer = [...this.state.players.values()].find(
        (player) =>
          player.id !== downed.id &&
          player.alive &&
          Math.hypot(player.x - downed.x, player.y - downed.y) <= REVIVE_RADIUS,
      );
      downed.reviveProgress = rescuer
        ? Math.min(1, downed.reviveProgress + delta / REVIVE_SECONDS)
        : Math.max(0, downed.reviveProgress - delta * 1.25);
      if (downed.reviveProgress >= 1) {
        downed.alive = true;
        downed.health = Math.ceil(downed.maxHealth * 0.4);
        downed.reviveProgress = 0;
        this.pushFx({ k: 'heal', x: downed.x, y: downed.y });
      }
    });
  }

  private updateBossBar() {
    let boss: ZombieState | undefined;
    this.state.zombies.forEach((zombie) => {
      const rank = ZOMBIES[zombie.type].rank;
      if (rank !== 'boss' && rank !== 'mini') return;
      if (!boss || zombie.maxHealth > boss.maxHealth) boss = zombie;
    });
    if (!boss) {
      this.state.bossName = '';
      this.state.bossHealth = 0;
      this.state.bossMaxHealth = 0;
      return;
    }
    this.state.bossName = ZOMBIES[boss.type].label;
    this.state.bossHealth = Math.max(0, Math.round(boss.health));
    this.state.bossMaxHealth = Math.round(boss.maxHealth);
  }

  // -------------------------------------------------------------- combat math

  private shoot(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    let shots = 0;
    while (player.fireCooldown <= 0 && player.ammo > 0 && shots < 4) {
      shots += 1;
      player.ammo -= 1;
      player.fireCooldown += config.fireDelay / 1000;
      player.firing = 0.12;
      const baseDamage = config.damage * (1 + upgrades.weaponDamage * 0.02);
      const muzzleX = player.x + Math.cos(player.rotation) * 26;
      const muzzleY = player.y + Math.sin(player.rotation) * 26;
      for (let pellet = 0; pellet < config.pellets; pellet += 1) {
        const spread = (Math.random() - 0.5) * config.spread * 2;
        const projectile = this.createProjectile(
          player.id,
          muzzleX,
          muzzleY,
          player.rotation + spread,
          baseDamage,
          config.speed,
          player.weapon,
        );
        projectile.pierce = config.pierce;
        projectile.life = weaponLife(config);
        projectile.radius = player.weapon === 'rocket' ? 8 : player.weapon === 'flamer' ? 13 : 4;
        projectile.splashRadius = config.splashRadius ?? 0;
        projectile.splashDamage =
          (config.splashDamage ?? 0) * (1 + upgrades.weaponDamage * 0.02);
        projectile.chain = config.chain ?? 0;
        projectile.chainRange = config.chainRange ?? 0;
        projectile.burn = config.burn ?? 0;
        projectile.burnSeconds = config.burnSeconds ?? 0;
      }
      this.pushFx({
        k: 'muzzle',
        x: muzzleX,
        y: muzzleY,
        a: player.rotation,
        s: player.weapon,
      });
    }
  }

  private createProjectile(
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

  private detonate(projectile: ProjectileState, x: number, y: number) {
    const radius = projectile.splashRadius;
    this.pushFx({ k: 'explosion', x, y, r: radius, s: projectile.kind });
    const victims: Array<[string, ZombieState]> = [];
    this.state.zombies.forEach((zombie, id) => {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      if (distance <= radius + zombie.radius) victims.push([id, zombie]);
    });
    for (const [id, zombie] of victims) {
      const distance = Math.hypot(zombie.x - x, zombie.y - y);
      const falloff = Math.max(0.35, 1 - distance / (radius + zombie.radius));
      this.damageZombie(id, zombie, projectile.splashDamage * falloff, projectile.ownerId);
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
      this.state.zombies.forEach((zombie, id) => {
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
      this.pushFx({ k: 'chain', x: fromX, y: fromY, x2: best.x, y2: best.y });
      fromX = best.x;
      fromY = best.y;
      this.damageZombie(bestId, best, damage, projectile.ownerId);
    }
  }

  private igniteZombie(zombie: ZombieState, dps: number, seconds: number, ownerId: string) {
    zombie.burnDps = Math.max(zombie.burnDps, dps);
    zombie.burning = Math.max(zombie.burning, seconds);
    if (ownerId) zombie.lastAttacker = ownerId;
  }

  private damageZombie(id: string, zombie: ZombieState, amount: number, ownerId: string) {
    zombie.health -= amount;
    if (zombie.health <= 0) this.killZombie(id, zombie, ownerId);
  }

  private killZombie(id: string, zombie: ZombieState, ownerId: string) {
    if (!this.state.zombies.has(id)) return;
    const config = ZOMBIES[zombie.type];
    this.state.zombies.delete(id);
    this.pushFx({ k: 'death', x: zombie.x, y: zombie.y, r: zombie.radius, s: zombie.type });

    const owner = ownerId ? this.state.players.get(ownerId) : undefined;
    if (owner) {
      owner.kills += 1;
      const upgrades = this.runtimePlayers.get(ownerId)?.upgrades ?? EMPTY_UPGRADES;
      owner.money += Math.round(
        zombie.reward * this.map.moneyScale * (1 + upgrades.income * 0.02),
      );
    }
    if (config.explode) this.explodeZombie(zombie, true);
  }

  private explodeZombie(zombie: ZombieState, alreadyDead = false) {
    const config = ZOMBIES[zombie.type];
    if (!config.explode) return;
    if (!alreadyDead) {
      let ownId = '';
      this.state.zombies.forEach((candidate, id) => {
        if (candidate === zombie) ownId = id;
      });
      if (ownId) {
        this.state.zombies.delete(ownId);
        this.pushFx({ k: 'death', x: zombie.x, y: zombie.y, r: zombie.radius, s: zombie.type });
      }
    }

    const radius = config.explode.radius;
    const damage = config.explode.damage * this.damageScale();
    this.pushFx({ k: 'explosion', x: zombie.x, y: zombie.y, r: radius, s: 'exploder' });

    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
      if (distance > radius) return;
      this.damagePlayer(player, damage * Math.max(0.3, 1 - distance / radius));
    });
    this.damageStructures(zombie.x, zombie.y, radius, damage * 1.2);

    const victims: Array<[string, ZombieState]> = [];
    this.state.zombies.forEach((other, id) => {
      if (other === zombie) return;
      if (Math.hypot(other.x - zombie.x, other.y - zombie.y) <= radius + other.radius) {
        victims.push([id, other]);
      }
    });
    for (const [id, other] of victims) this.damageZombie(id, other, damage * 0.5, '');
  }

  private bossSlam(zombie: ZombieState, radius: number, damage: number) {
    this.pushFx({ k: 'explosion', x: zombie.x, y: zombie.y, r: radius, s: 'slam' });
    const scaled = damage * this.damageScale();
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
      if (distance > radius) return;
      this.damagePlayer(player, scaled * Math.max(0.4, 1 - distance / radius));
    });
    this.damageStructures(zombie.x, zombie.y, radius, scaled * 1.5);
  }

  private bossSummon(zombie: ZombieState, count: number, type: ZombieType) {
    if (this.state.zombies.size >= MAX_ACTIVE_ZOMBIES) return;
    this.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: 90, s: 'summon' });
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random();
      this.spawnZombie(type, {
        x: this.clamp(zombie.x + Math.cos(angle) * (zombie.radius + 46), 40, ARENA.width - 40),
        y: this.clamp(zombie.y + Math.sin(angle) * (zombie.radius + 46), 40, ARENA.height - 40),
      });
    }
  }

  private damageStructures(x: number, y: number, radius: number, damage: number) {
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

  private damagePlayer(player: PlayerState, amount: number) {
    const upgrades = this.runtimePlayers.get(player.id)?.upgrades ?? EMPTY_UPGRADES;
    const reduction = 1 - Math.min(0.2, upgrades.armor * 0.01);
    player.health = Math.max(0, player.health - amount * reduction);
    player.hurt = 0.35;
    if (player.health <= 0 && player.alive) {
      player.alive = false;
      player.reviveProgress = 0;
      this.pushFx({ k: 'blood', x: player.x, y: player.y, r: 40, s: 'down' });
    }
  }

  /**
   * A dry weapon would otherwise leave a wave unfinishable, so the pistol is an
   * endless fallback.
   */
  private fallBackToPistol(player: PlayerState) {
    if (player.weapon !== 'pistol') {
      player.weapon = 'pistol';
      this.pushFx({ k: 'heal', x: player.x, y: player.y, s: 'pistol' });
    }
    player.reserveAmmo = WEAPONS.pistol.reserve;
  }

  private beginReload(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    const magazine = this.magazineSize(player.weapon, upgrades);
    if (player.ammo >= magazine || player.reserveAmmo <= 0) return;
    player.reloading = config.reload / 1000 / (1 + upgrades.reloadSpeed * 0.02);
  }

  private completeReload(player: PlayerState, upgrades: PermanentUpgrades) {
    const missing = this.magazineSize(player.weapon, upgrades) - player.ammo;
    const amount = Math.min(missing, player.reserveAmmo);
    player.ammo += amount;
    player.reserveAmmo -= amount;
  }

  private magazineSize(weapon: WeaponType, upgrades: PermanentUpgrades) {
    return Math.max(1, Math.round(WEAPONS[weapon].magazine * (1 + upgrades.magazineSize * 0.02)));
  }

  // ------------------------------------------------------------------- waves

  private spawnZombies(delta: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnDelay -= delta;
    if (this.spawnDelay > 0) return;
    if (this.state.zombies.size >= MAX_ACTIVE_ZOMBIES) return;
    this.spawnDelay = Math.max(0.12, 0.42 - this.state.wave * 0.015);
    const type = this.spawnQueue.shift();
    if (!type) return;
    this.spawnZombie(type);
  }

  /**
   * Enemy health scales with the full map difficulty, damage only with part of
   * it — otherwise the last map one-shots players who have not farmed upgrades.
   */
  private damageScale() {
    return 1 + (this.map.difficulty - 1) * 0.7;
  }

  private waveDamageScale() {
    return 1 + Math.min(0.5, Math.max(0, this.state.wave - 1) * 0.025);
  }

  private spawnZombie(type: ZombieType, at?: { x: number; y: number }) {
    const config = ZOMBIES[type];
    const zombie = new ZombieState();
    zombie.id = this.nextId('z');
    zombie.type = type;
    const spawn = at ?? this.edgeSpawn();
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
    zombie.chargeTimer = config.charge ? config.charge.every * 0.6 : 99;
    zombie.slamTimer = config.slam ? config.slam.every * 0.8 : 99;
    zombie.summonTimer = config.summon ? config.summon.every * 0.7 : 99;
    this.state.zombies.set(zombie.id, zombie);
    if (config.rank === 'boss' || config.rank === 'mini') {
      this.pushFx({ k: 'boss', x: zombie.x, y: zombie.y, r: zombie.radius, s: 'spawn' });
    }
    return zombie;
  }

  private startRun() {
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.state.wave = 0;
    this.state.zombies.clear();
    this.state.projectiles.clear();
    this.state.defenses.clear();
    this.state.bossName = '';
    this.state.bossHealth = 0;
    this.state.bossMaxHealth = 0;
    let index = 0;
    this.state.players.forEach((player, id) => {
      const runtime = this.runtimePlayers.get(id);
      const upgrades = runtime?.upgrades ?? EMPTY_UPGRADES;
      const spawn = this.playerSpawn(index++);
      player.x = spawn.x;
      player.y = spawn.y;
      player.maxHealth = Math.round(100 * (1 + upgrades.maxHealth * 0.02));
      player.health = player.maxHealth;
      player.alive = true;
      player.money = START_MONEY;
      player.weapon = 'pistol';
      player.ammo = this.magazineSize('pistol', upgrades);
      player.reserveAmmo = WEAPONS.pistol.reserve;
      player.grenades = 3;
      player.grenadeCooldown = 0;
      player.ready = false;
      player.kills = 0;
      player.reviveProgress = 0;
      player.reloading = 0;
      player.firing = 0;
      player.hurt = 0;
      if (runtime) {
        runtime.grenadeRecharge = [];
        runtime.grenadeThrowLock = 0;
      }
    });
    this.startNextWave();
  }

  private startNextWave() {
    if (this.state.wave >= this.map.waves.length) {
      this.endRun(true);
      return;
    }
    this.state.phase = 'combat';
    this.state.wave += 1;
    const definition = this.map.waves[this.state.wave - 1];
    this.spawnQueue = [...definition.zombies];
    this.spawnDelay = 0.3;
    this.state.nextWaveIn = 0;
    this.state.waveKind = definition.kind;
    this.state.waveLabel = definition.label;
    this.state.statusText =
      definition.kind === 'boss'
        ? `ENDBOSS · ${this.map.name}`
        : definition.kind === 'mini'
          ? `Welle ${this.state.wave} · Mini-Boss`
          : `Welle ${this.state.wave} / ${this.map.waves.length}`;
    this.state.players.forEach((player) => (player.ready = false));
  }

  private finishWave() {
    if (this.state.wave >= this.map.waves.length) {
      this.endRun(true);
      return;
    }
    const definition = this.map.waves[this.state.wave - 1];
    const multiplier = definition.kind === 'mini' ? 2.1 : 1;
    const reward = Math.round(
      (90 + this.state.wave * 42) * this.map.moneyScale * multiplier,
    );
    this.state.phase = 'build';
    this.state.nextWaveIn = BUILD_SECONDS;
    this.state.statusText = `Welle geschafft · +${reward} $ für alle`;
    this.state.projectiles.clear();
    this.state.bossName = '';
    this.state.bossHealth = 0;
    this.state.bossMaxHealth = 0;
    this.state.players.forEach((player) => {
      const upgrades = this.runtimePlayers.get(player.id)?.upgrades ?? EMPTY_UPGRADES;
      player.money += Math.round(reward * (1 + upgrades.income * 0.02));
      if (!player.alive) {
        player.alive = true;
        player.health = Math.ceil(player.maxHealth * 0.45);
        player.reviveProgress = 0;
      }
      player.grenades = 3;
      player.grenadeCooldown = 0;
      player.ready = false;
      const runtime = this.runtimePlayers.get(player.id);
      if (runtime) {
        runtime.grenadeRecharge = [];
        runtime.grenadeThrowLock = 0;
      }
    });
  }

  private endRun(victory = false) {
    if (this.state.phase === 'gameover') return;
    this.state.phase = 'gameover';
    this.state.statusText = victory
      ? `${this.map.name} gesichert!`
      : `Der Run auf ${this.map.name} ist vorbei`;
    const gold = Math.round(
      (15 + this.state.wave * 12) * this.map.moneyScale + (victory ? this.map.reward : 0),
    );
    this.broadcast('permanent_reward', {
      gold,
      runId: this.runId,
      victory,
      mapId: this.map.id,
      wave: this.state.wave,
    });
  }

  private checkDefeat() {
    if (this.state.players.size === 0) return true;
    const defeated = [...this.state.players.values()].every((player) => !player.alive);
    if (defeated) this.endRun(false);
    return defeated;
  }

  // -------------------------------------------------------------------- shop

  private buyWeapon(sessionId: string, weapon: WeaponType) {
    const player = this.state.players.get(sessionId);
    const runtime = this.runtimePlayers.get(sessionId);
    if (!player || !runtime || this.state.phase !== 'build' || !(weapon in WEAPONS)) return;
    const config = WEAPONS[weapon];
    if (weapon === 'pistol' || player.money < config.cost || player.weapon === weapon) return;
    player.money -= config.cost;
    player.weapon = weapon;
    player.ammo = this.magazineSize(weapon, runtime.upgrades);
    player.reserveAmmo = config.reserve;
    player.reloading = 0;
  }

  private buyAmmo(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'build') return;
    const config = WEAPONS[player.weapon];
    const cost = Math.round(config.ammoCost * this.map.moneyScale);
    if (player.money < cost) return;
    player.money -= cost;
    player.reserveAmmo += config.reserve;
  }

  private buyHeal(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'build') return;
    const cost = Math.round(260 * this.map.moneyScale);
    if (player.money < cost || player.health >= player.maxHealth) return;
    player.money -= cost;
    player.health = player.maxHealth;
    this.pushFx({ k: 'heal', x: player.x, y: player.y });
  }

  private placeDefense(
    sessionId: string,
    payload: { type?: DefenseType; x?: number; y?: number; rotation?: number },
  ) {
    const player = this.state.players.get(sessionId);
    const runtime = this.runtimePlayers.get(sessionId);
    const type = payload.type;
    if (!player || !runtime || this.state.phase !== 'build' || !type || !(type in DEFENSES)) return;
    const config = DEFENSES[type];
    const x = this.clamp(Number(payload.x) || player.x, 70, ARENA.width - 70);
    const y = this.clamp(Number(payload.y) || player.y, 70, ARENA.height - 70);
    const overlaps = [...this.state.defenses.values()].some(
      (defense) => Math.hypot(defense.x - x, defense.y - y) < 62,
    );
    if (player.money < config.cost || overlaps) return;
    if (Math.hypot(player.x - x, player.y - y) > 380) return;
    if (!this.canStand(x, y, Math.max(config.width, config.height) / 2 - 6)) return;

    const defense = new DefenseState();
    defense.id = this.nextId('d');
    defense.ownerId = sessionId;
    defense.type = type;
    defense.x = x;
    defense.y = y;
    defense.rotation =
      config.kind === 'barricade'
        ? (Math.round((Number(payload.rotation) || 0) / (Math.PI / 2)) * (Math.PI / 2)) % Math.PI
        : 0;
    const bonus = config.kind === 'barricade' ? 1 + runtime.upgrades.barricadeHealth * 0.02 : 1;
    defense.maxHealth = Math.round(config.health * bonus);
    defense.health = defense.maxHealth;
    player.money -= config.cost;
    this.state.defenses.set(defense.id, defense);
    this.pushFx({ k: 'structure', x, y, s: type });
  }

  private sellNearest(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'build') return;
    const nearest = [...this.state.defenses.values()]
      .filter((defense) => defense.ownerId === sessionId)
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
      )[0];
    if (!nearest || Math.hypot(nearest.x - player.x, nearest.y - player.y) > 110) return;
    player.money += Math.round(DEFENSES[nearest.type].cost * 0.7);
    this.state.defenses.delete(nearest.id);
  }

  private repairNearest(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'build') return;
    const nearest = [...this.state.defenses.values()].sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
    )[0];
    if (!nearest || Math.hypot(nearest.x - player.x, nearest.y - player.y) > 115) return;
    const missing = nearest.maxHealth - nearest.health;
    const repair = Math.min(missing, Math.floor(player.money / 0.35));
    if (repair <= 0) return;
    player.money -= Math.ceil(repair * 0.35);
    nearest.health += repair;
  }

  private throwGrenade(sessionId: string, target: { x?: number; y?: number }) {
    const player = this.state.players.get(sessionId);
    const runtime = this.runtimePlayers.get(sessionId);
    const upgrades = runtime?.upgrades ?? EMPTY_UPGRADES;
    if (
      !player ||
      !player.alive ||
      this.state.phase !== 'combat' ||
      player.grenades <= 0 ||
      !runtime ||
      runtime.grenadeThrowLock > 0
    ) {
      return;
    }
    let x = Number(target.x) || player.x;
    let y = Number(target.y) || player.y;
    const angle = Math.atan2(y - player.y, x - player.x);
    const distance = Math.min(360, Math.hypot(x - player.x, y - player.y));
    x = player.x + Math.cos(angle) * distance;
    y = player.y + Math.sin(angle) * distance;
    const radius = 110 * (1 + upgrades.grenadeRadius * 0.02);
    const damage = 120 * (1 + upgrades.grenadeDamage * 0.02);

    const victims: Array<[string, ZombieState]> = [];
    this.state.zombies.forEach((zombie, id) => {
      if (Math.hypot(zombie.x - x, zombie.y - y) <= radius + zombie.radius) victims.push([id, zombie]);
    });
    for (const [id, zombie] of victims) this.damageZombie(id, zombie, damage, player.id);

    player.grenades -= 1;
    const rechargeTime = Math.max(6, 18 / (1 + upgrades.grenadeCooldown * 0.02));
    runtime.grenadeRecharge.push(rechargeTime);
    runtime.grenadeThrowLock = 0.35;
    player.grenadeCooldown = Math.min(...runtime.grenadeRecharge);
    this.pushFx({ k: 'explosion', x, y, r: radius, s: 'grenade' });
  }

  // -------------------------------------------------------------- collisions

  private canStand(x: number, y: number, radius: number) {
    for (const obstacle of this.map.obstacles) {
      if (this.circleOverlapsRect(x, y, radius, obstacle)) return false;
    }
    return true;
  }

  private circleOverlapsRect(x: number, y: number, radius: number, rect: MapObstacle) {
    const closestX = this.clamp(x, rect.x - rect.w / 2, rect.x + rect.w / 2);
    const closestY = this.clamp(y, rect.y - rect.h / 2, rect.y + rect.h / 2);
    return Math.hypot(x - closestX, y - closestY) < radius;
  }

  private resolvePlayerObstacleCollision(player: PlayerState) {
    for (const rect of this.map.obstacles) {
      if (!this.circleOverlapsRect(player.x, player.y, PLAYER_RADIUS, rect)) continue;
      const closestX = this.clamp(player.x, rect.x - rect.w / 2, rect.x + rect.w / 2);
      const closestY = this.clamp(player.y, rect.y - rect.h / 2, rect.y + rect.h / 2);
      let offsetX = player.x - closestX;
      let offsetY = player.y - closestY;
      let distance = Math.hypot(offsetX, offsetY);
      if (distance === 0) {
        const pushX = rect.w / 2 + PLAYER_RADIUS - Math.abs(player.x - rect.x);
        const pushY = rect.h / 2 + PLAYER_RADIUS - Math.abs(player.y - rect.y);
        if (pushX < pushY) player.x += (player.x < rect.x ? -1 : 1) * pushX;
        else player.y += (player.y < rect.y ? -1 : 1) * pushY;
        continue;
      }
      offsetX /= distance;
      offsetY /= distance;
      distance = PLAYER_RADIUS - distance;
      player.x += offsetX * distance;
      player.y += offsetY * distance;
    }
  }

  private blockingDefense(zombie: ZombieState, dx: number, dy: number) {
    return [...this.state.defenses.values()].find((defense) =>
      this.circleOverlapsDefense(zombie.x + dx, zombie.y + dy, zombie.radius, defense),
    );
  }

  private resolvePlayerDefenseCollision(player: PlayerState) {
    this.state.defenses.forEach((defense) => {
      const config = DEFENSES[defense.type];
      if (config.kind === 'turret') {
        const dx = player.x - defense.x;
        const dy = player.y - defense.y;
        const distance = Math.hypot(dx, dy);
        const minimum = config.width / 2 + PLAYER_RADIUS - 4;
        if (distance > 0 && distance < minimum) {
          player.x = defense.x + (dx / distance) * minimum;
          player.y = defense.y + (dy / distance) * minimum;
        }
        return;
      }

      const cos = Math.cos(-defense.rotation);
      const sin = Math.sin(-defense.rotation);
      const dx = player.x - defense.x;
      const dy = player.y - defense.y;
      let localX = dx * cos - dy * sin;
      let localY = dx * sin + dy * cos;
      const halfWidth = config.width / 2;
      const halfHeight = config.height / 2;
      const closestX = this.clamp(localX, -halfWidth, halfWidth);
      const closestY = this.clamp(localY, -halfHeight, halfHeight);
      const offsetX = localX - closestX;
      const offsetY = localY - closestY;
      const distance = Math.hypot(offsetX, offsetY);

      if (distance > 0 && distance < PLAYER_RADIUS) {
        const push = PLAYER_RADIUS - distance;
        localX += (offsetX / distance) * push;
        localY += (offsetY / distance) * push;
      } else if (distance === 0) {
        const pushX = halfWidth + PLAYER_RADIUS - Math.abs(localX);
        const pushY = halfHeight + PLAYER_RADIUS - Math.abs(localY);
        if (pushX < pushY) localX += (localX < 0 ? -1 : 1) * pushX;
        else localY += (localY < 0 ? -1 : 1) * pushY;
      } else {
        return;
      }

      const worldCos = Math.cos(defense.rotation);
      const worldSin = Math.sin(defense.rotation);
      player.x = defense.x + localX * worldCos - localY * worldSin;
      player.y = defense.y + localX * worldSin + localY * worldCos;
    });
  }

  private circleOverlapsDefense(x: number, y: number, radius: number, defense: DefenseState) {
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

  private segmentHitsCircle(
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
    if (lengthSquared === 0) return Math.hypot(cx - x1, cy - y1) <= radius;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lengthSquared;
    t = this.clamp(t, 0, 1);
    return Math.hypot(cx - (x1 + dx * t), cy - (y1 + dy * t)) <= radius;
  }

  private segmentHitsObstacle(x1: number, y1: number, x2: number, y2: number) {
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
      if (this.segmentIntersectsRect(x1, y1, x2, y2, rect)) return rect;
    }
    return undefined;
  }

  private segmentIntersectsRect(
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
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true;

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
        if (near > 0 || far < 0) return false;
        continue;
      }
      let t1 = near / delta;
      let t2 = far / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
    return true;
  }

  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number) {
    return !this.segmentHitsObstacle(x1, y1, x2, y2);
  }

  // ------------------------------------------------------------------ lookups

  private nearestLivingPlayer(x: number, y: number) {
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

  private nearestZombie(x: number, y: number, range: number, requireSight = false) {
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

  private everyoneReady() {
    return (
      this.state.players.size > 0 &&
      [...this.state.players.values()].every((player) => player.ready)
    );
  }

  // -------------------------------------------------------------- networking

  private pushFx(event: FxEvent) {
    if (this.fxQueue.length >= MAX_FX_PER_SNAPSHOT) return;
    this.fxQueue.push({
      ...event,
      x: Math.round(event.x),
      y: Math.round(event.y),
      x2: event.x2 === undefined ? undefined : Math.round(event.x2),
      y2: event.y2 === undefined ? undefined : Math.round(event.y2),
    });
  }

  private broadcastSnapshot() {
    if (this.clients.length === 0) {
      this.fxQueue.length = 0;
      return;
    }
    const payload = this.state.toJSON() as Record<string, unknown>;
    this.compact(payload['players'], PLAYER_PRECISION);
    this.compact(payload['zombies'], ZOMBIE_PRECISION);
    this.compact(payload['projectiles'], PROJECTILE_PRECISION);
    this.compact(payload['defenses'], DEFENSE_PRECISION);
    if (this.fxQueue.length > 0) payload['fx'] = this.fxQueue;
    this.broadcast('snapshot', payload);
    this.fxQueue = [];
  }

  /** Trims float noise so a full snapshot stays small on slow connections. */
  private compact(group: unknown, decimals: Record<string, number>) {
    if (!group || typeof group !== 'object') return;
    for (const entity of Object.values(group as Record<string, Record<string, unknown>>)) {
      for (const key in decimals) {
        const value = entity[key];
        if (typeof value !== 'number') continue;
        const factor = decimals[key];
        entity[key] = factor === 1 ? Math.round(value) : Math.round(value * factor) / factor;
      }
    }
  }

  private cleanInput(input: Partial<PlayerInput>): PlayerInput {
    return {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      shoot: Boolean(input.shoot),
      reload: Boolean(input.reload),
      aimX: this.clamp(Number(input.aimX) || 0, 0, ARENA.width),
      aimY: this.clamp(Number(input.aimY) || 0, 0, ARENA.height),
    };
  }

  private cleanUpgrades(upgrades?: Partial<PermanentUpgrades>): PermanentUpgrades {
    return Object.fromEntries(
      Object.keys(EMPTY_UPGRADES).map((key) => [
        key,
        this.clamp(Math.floor(Number(upgrades?.[key as keyof PermanentUpgrades]) || 0), 0, 20),
      ]),
    ) as unknown as PermanentUpgrades;
  }

  private cleanName(name?: string) {
    const clean = String(name ?? 'Überlebender')
      .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
      .trim()
      .slice(0, 18);
    return clean || 'Überlebender';
  }

  private cleanCode(code?: string) {
    return String(code ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);
  }

  private playerSpawn(index: number) {
    const angle = (Math.PI * 2 * index) / 4;
    return {
      x: ARENA.width / 2 + Math.cos(angle) * 70,
      y: ARENA.height / 2 + Math.sin(angle) * 70,
    };
  }

  private edgeSpawn() {
    const side = Math.floor(Math.random() * 4);
    const margin = 25;
    if (side === 0) return { x: margin, y: 70 + Math.random() * (ARENA.height - 140) };
    if (side === 1) return { x: ARENA.width - margin, y: 70 + Math.random() * (ARENA.height - 140) };
    if (side === 2) return { x: 70 + Math.random() * (ARENA.width - 140), y: margin };
    return { x: 70 + Math.random() * (ARENA.width - 140), y: ARENA.height - margin };
  }

  private nextId(prefix: string) {
    this.entityCounter += 1;
    return `${prefix}${this.entityCounter}`;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }
}
