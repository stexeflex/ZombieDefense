import type { Client } from 'colyseus';
import { Room } from 'colyseus';
import {
  ARENA,
  DEFENSES,
  EMPTY_UPGRADES,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  WAVES,
  WEAPONS,
  type DefenseType,
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

const ZOMBIES: Record<
  ZombieType,
  { health: number; speed: number; damage: number; radius: number }
> = {
  normal: { health: 58, speed: 72, damage: 12, radius: 18 },
  fast: { health: 34, speed: 122, damage: 8, radius: 14 },
  big: { health: 320, speed: 43, damage: 30, radius: 29 },
};

export class ZombieRoom extends Room<{ state: GameState }> {
  maxClients = 4;
  private runtimePlayers = new Map<string, RuntimePlayer>();
  private spawnQueue: ZombieType[] = [];
  private spawnDelay = 0;
  private entityCounter = 0;
  private runId = '';
  private snapshotElapsed = 0;

  onCreate(options: JoinOptions) {
    const state = new GameState();
    state.lobbyCode = this.cleanCode(options.lobbyCode);
    this.setState(state);
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 50);

    this.onMessage('input', (client, input: Partial<PlayerInput>) => {
      const runtime = this.runtimePlayers.get(client.sessionId);
      if (!runtime) return;
      runtime.input = this.cleanInput(input);
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
    this.onMessage(
      'place',
      (
        client,
        payload: { type?: DefenseType; x?: number; y?: number; rotation?: number },
      ) =>
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

  private update(deltaMs: number) {
    const delta = Math.min(deltaMs, 100) / 1000;
    if (this.state.phase === 'combat') this.updateCombat(delta);
    if (this.state.phase === 'build') this.updateBuild(delta);

    this.snapshotElapsed += deltaMs;
    const snapshotInterval = this.state.phase === 'combat' ? 75 : 150;
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
      player.fireCooldown = Math.max(0, player.fireCooldown - delta);
      runtime.grenadeThrowLock = Math.max(0, runtime.grenadeThrowLock - delta);
      runtime.grenadeRecharge = runtime.grenadeRecharge
        .map((timer) => timer - delta)
        .sort((a, b) => a - b);
      while (runtime.grenadeRecharge[0] <= 0 && player.grenades < 3) {
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
      this.resolvePlayerDefenseCollision(player);

      player.rotation = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      if (
        this.state.phase === 'combat' &&
        input.reload &&
        player.reloading === 0
      ) {
        this.beginReload(player, runtime.upgrades);
      }
      if (this.state.phase === 'combat' && input.shoot && player.reloading === 0) {
        this.shoot(player, runtime.upgrades);
      }
      if (
        this.state.phase === 'combat' &&
        player.ammo <= 0 &&
        player.reserveAmmo > 0 &&
        player.reloading === 0
      ) {
        this.beginReload(player, runtime.upgrades);
      }
    });
  }

  private updateZombies(delta: number) {
    const expired: string[] = [];
    this.state.zombies.forEach((zombie, id) => {
      zombie.attackCooldown = Math.max(0, zombie.attackCooldown - delta);
      const target = this.nearestLivingPlayer(zombie.x, zombie.y);
      if (!target) return;

      const angle = Math.atan2(target.y - zombie.y, target.x - zombie.x);
      zombie.rotation = angle;
      const stepX = Math.cos(angle) * zombie.speed * delta;
      const stepY = Math.sin(angle) * zombie.speed * delta;
      const blocking = this.blockingDefense(zombie, stepX, stepY);

      if (blocking) {
        if (zombie.attackCooldown <= 0) {
          blocking.health -= zombie.damage * (zombie.type === 'big' ? 1.5 : 1);
          zombie.attackCooldown = zombie.type === 'fast' ? 0.65 : 0.9;
          if (blocking.health <= 0) this.state.defenses.delete(blocking.id);
        }
      } else {
        zombie.x += stepX;
        zombie.y += stepY;
      }

      const distance = Math.hypot(target.x - zombie.x, target.y - zombie.y);
      if (distance < zombie.radius + 20 && zombie.attackCooldown <= 0) {
        target.health = Math.max(0, target.health - zombie.damage);
        zombie.attackCooldown = zombie.type === 'fast' ? 0.7 : 1;
        if (target.health <= 0) {
          target.alive = false;
          target.reviveProgress = 0;
        }
      }
      if (zombie.health <= 0) expired.push(id);
    });
    expired.forEach((id) => this.state.zombies.delete(id));
  }

  private updateProjectiles(delta: number) {
    const expired: string[] = [];
    this.state.projectiles.forEach((projectile, id) => {
      projectile.life -= delta;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      if (
        projectile.life <= 0 ||
        projectile.x < 0 ||
        projectile.x > ARENA.width ||
        projectile.y < 0 ||
        projectile.y > ARENA.height
      ) {
        expired.push(id);
        return;
      }

      for (const [zombieId, zombie] of this.state.zombies.entries()) {
        if (projectile.hitIds.has(zombieId)) continue;
        if (Math.hypot(zombie.x - projectile.x, zombie.y - projectile.y) < zombie.radius + projectile.radius) {
          projectile.hitIds.add(zombieId);
          zombie.health -= projectile.damage;
          if (zombie.health <= 0) {
            const owner = this.state.players.get(projectile.ownerId);
            if (owner) owner.kills += 1;
            this.state.zombies.delete(zombieId);
          }
          if (projectile.penetration <= 0) {
            expired.push(id);
            break;
          }
          projectile.penetration -= 1;
        }
      }
    });
    expired.forEach((id) => this.state.projectiles.delete(id));
  }

  private updateTurrets(delta: number) {
    this.state.defenses.forEach((defense) => {
      if (defense.type !== 'turret') return;
      defense.cooldown = Math.max(0, defense.cooldown - delta);
      const target = this.nearestZombie(defense.x, defense.y, 360);
      if (!target) return;
      defense.rotation = Math.atan2(target.y - defense.y, target.x - defense.x);
      if (defense.cooldown <= 0) {
        const upgrades = this.runtimePlayers.get(defense.ownerId)?.upgrades ?? EMPTY_UPGRADES;
        this.createProjectile(
          defense.ownerId,
          defense.x,
          defense.y,
          defense.rotation,
          10 * (1 + upgrades.turretDamage * 0.02),
          760,
          'turret',
        );
        defense.cooldown = 0.22;
      }
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
        downed.health = Math.ceil(downed.maxHealth * 0.35);
        downed.reviveProgress = 0;
      }
    });
  }

  private shoot(player: PlayerState, upgrades: PermanentUpgrades) {
    if (player.fireCooldown > 0 || player.ammo <= 0) return;
    const config = WEAPONS[player.weapon];
    player.ammo -= 1;
    player.fireCooldown = config.fireDelay / 1000;
    const baseDamage = config.damage * (1 + upgrades.weaponDamage * 0.02);
    for (let pellet = 0; pellet < config.pellets; pellet += 1) {
      const spread = (Math.random() - 0.5) * config.spread * 2;
      this.createProjectile(
        player.id,
        player.x + Math.cos(player.rotation) * 24,
        player.y + Math.sin(player.rotation) * 24,
        player.rotation + spread,
        baseDamage,
        config.speed,
        player.weapon,
      );
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
    projectile.penetration = kind === 'rifle' ? 1 : 0;
    projectile.life = kind === 'shotgun' ? 0.58 : 1.25;
    this.state.projectiles.set(projectile.id, projectile);
  }

  private beginReload(player: PlayerState, upgrades: PermanentUpgrades) {
    const config = WEAPONS[player.weapon];
    const magazine = this.magazineSize(player.weapon, upgrades);
    if (player.ammo >= magazine || player.reserveAmmo <= 0) return;
    player.reloading = (config.reload / 1000) / (1 + upgrades.reloadSpeed * 0.02);
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

  private spawnZombies(delta: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnDelay -= delta;
    if (this.spawnDelay > 0) return;
    this.spawnDelay = Math.max(0.18, 0.46 - this.state.wave * 0.02);
    const type = this.spawnQueue.shift();
    if (!type) return;
    const config = ZOMBIES[type];
    const zombie = new ZombieState();
    zombie.id = this.nextId('z');
    zombie.type = type;
    const spawn = this.edgeSpawn();
    zombie.x = spawn.x;
    zombie.y = spawn.y;
    const waveScale = 1 + Math.max(0, this.state.wave - 1) * 0.08;
    zombie.maxHealth = Math.round(config.health * waveScale);
    zombie.health = zombie.maxHealth;
    zombie.speed = config.speed * (1 + Math.min(0.25, this.state.wave * 0.015));
    zombie.damage = config.damage * (1 + Math.max(0, this.state.wave - 1) * 0.04);
    zombie.radius = config.radius;
    this.state.zombies.set(zombie.id, zombie);
  }

  private startRun() {
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.state.wave = 0;
    this.state.zombies.clear();
    this.state.projectiles.clear();
    this.state.defenses.clear();
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
      player.money = 250;
      player.weapon = 'pistol';
      player.ammo = this.magazineSize('pistol', upgrades);
      player.reserveAmmo = WEAPONS.pistol.reserve;
      player.grenades = 3;
      player.grenadeCooldown = 0;
      player.ready = false;
      player.kills = 0;
      player.reviveProgress = 0;
      player.reloading = 0;
      if (runtime) {
        runtime.grenadeRecharge = [];
        runtime.grenadeThrowLock = 0;
      }
    });
    this.startNextWave();
  }

  private startNextWave() {
    if (this.state.wave >= WAVES.length) {
      this.endRun(true);
      return;
    }
    this.state.phase = 'combat';
    this.state.wave += 1;
    this.spawnQueue = [...WAVES[this.state.wave - 1]];
    this.spawnDelay = 0.25;
    this.state.nextWaveIn = 0;
    this.state.statusText = `Welle ${this.state.wave}`;
    this.state.players.forEach((player) => (player.ready = false));
  }

  private finishWave() {
    const reward = 100 + this.state.wave * 45;
    this.state.phase = 'build';
    this.state.nextWaveIn = 180;
    this.state.statusText = `Welle geschafft · +${reward} $ für alle`;
    this.state.projectiles.clear();
    this.state.players.forEach((player) => {
      player.money += reward;
      if (!player.alive) {
        player.alive = true;
        player.health = Math.ceil(player.maxHealth * 0.35);
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
    this.state.statusText = victory ? 'Alle festen Wellen geschafft!' : 'Der Run ist vorbei';
    const gold = 20 + this.state.wave * 15 + (victory ? 100 : 0);
    this.broadcast('permanent_reward', { gold, runId: this.runId, victory });
  }

  private checkDefeat() {
    if (this.state.players.size === 0) return true;
    const defeated = [...this.state.players.values()].every((player) => !player.alive);
    if (defeated) this.endRun(false);
    return defeated;
  }

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
    if (!player || this.state.phase !== 'build' || player.money < 90) return;
    player.money -= 90;
    player.reserveAmmo += WEAPONS[player.weapon].reserve;
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
    if (player.money < config.cost || overlaps || Math.hypot(player.x - x, player.y - y) > 360) return;
    const defense = new DefenseState();
    defense.id = this.nextId('d');
    defense.ownerId = sessionId;
    defense.type = type;
    defense.x = x;
    defense.y = y;
    defense.rotation =
      type === 'barricade'
        ? (Math.round((Number(payload.rotation) || 0) / (Math.PI / 2)) * (Math.PI / 2)) %
          Math.PI
        : 0;
    const bonus = type === 'barricade' ? 1 + runtime.upgrades.barricadeHealth * 0.02 : 1;
    defense.maxHealth = Math.round(config.health * bonus);
    defense.health = defense.maxHealth;
    player.money -= config.cost;
    this.state.defenses.set(defense.id, defense);
  }

  private sellNearest(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'build') return;
    const nearest = [...this.state.defenses.values()]
      .filter((defense) => defense.ownerId === sessionId)
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) -
          Math.hypot(b.x - player.x, b.y - player.y),
      )[0];
    if (!nearest || Math.hypot(nearest.x - player.x, nearest.y - player.y) > 100) return;
    player.money += Math.round(DEFENSES[nearest.type].cost * 0.7);
    this.state.defenses.delete(nearest.id);
  }

  private repairNearest(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'build') return;
    const nearest = [...this.state.defenses.values()].sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) -
        Math.hypot(b.x - player.x, b.y - player.y),
    )[0];
    if (!nearest || Math.hypot(nearest.x - player.x, nearest.y - player.y) > 105) return;
    const missing = nearest.maxHealth - nearest.health;
    const repair = Math.min(missing, Math.floor(player.money / 0.4));
    if (repair <= 0) return;
    player.money -= Math.ceil(repair * 0.4);
    nearest.health += repair;
  }

  private throwGrenade(sessionId: string, target: { x?: number; y?: number }) {
    const player = this.state.players.get(sessionId);
    const upgrades = this.runtimePlayers.get(sessionId)?.upgrades ?? EMPTY_UPGRADES;
    const runtime = this.runtimePlayers.get(sessionId);
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
    const distance = Math.min(340, Math.hypot(x - player.x, y - player.y));
    x = player.x + Math.cos(angle) * distance;
    y = player.y + Math.sin(angle) * distance;
    const radius = 105 * (1 + upgrades.grenadeRadius * 0.02);
    const damage = 95 * (1 + upgrades.grenadeDamage * 0.02);
    this.state.zombies.forEach((zombie, id) => {
      if (Math.hypot(zombie.x - x, zombie.y - y) <= radius + zombie.radius) {
        zombie.health -= damage;
        if (zombie.health <= 0) {
          player.kills += 1;
          this.state.zombies.delete(id);
        }
      }
    });
    player.grenades -= 1;
    const rechargeTime = Math.max(7, 20 / (1 + upgrades.grenadeCooldown * 0.02));
    runtime.grenadeRecharge.push(rechargeTime);
    runtime.grenadeThrowLock = 0.35;
    player.grenadeCooldown = Math.min(...runtime.grenadeRecharge);
    this.broadcast('explosion', { x, y, radius });
  }

  private blockingDefense(zombie: ZombieState, dx: number, dy: number) {
    return [...this.state.defenses.values()].find((defense) =>
      this.circleOverlapsDefense(zombie.x + dx, zombie.y + dy, zombie.radius, defense),
    );
  }

  private resolvePlayerDefenseCollision(player: PlayerState) {
    this.state.defenses.forEach((defense) => {
      if (defense.type === 'turret') {
        const dx = player.x - defense.x;
        const dy = player.y - defense.y;
        const distance = Math.hypot(dx, dy);
        const minimum = 25 + PLAYER_RADIUS;
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
      const halfWidth = 29;
      const halfHeight = 16;
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

  private circleOverlapsDefense(
    x: number,
    y: number,
    radius: number,
    defense: DefenseState,
  ) {
    if (defense.type === 'turret') {
      return Math.hypot(x - defense.x, y - defense.y) < radius + 25;
    }

    const cos = Math.cos(-defense.rotation);
    const sin = Math.sin(-defense.rotation);
    const dx = x - defense.x;
    const dy = y - defense.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const closestX = this.clamp(localX, -29, 29);
    const closestY = this.clamp(localY, -16, 16);
    return Math.hypot(localX - closestX, localY - closestY) < radius;
  }

  private nearestLivingPlayer(x: number, y: number) {
    return [...this.state.players.values()]
      .filter((player) => player.alive)
      .sort(
        (a, b) =>
          Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )[0];
  }

  private nearestZombie(x: number, y: number, range: number) {
    return [...this.state.zombies.values()]
      .filter((zombie) => Math.hypot(zombie.x - x, zombie.y - y) <= range)
      .sort(
        (a, b) =>
          Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )[0];
  }

  private everyoneReady() {
    return (
      this.state.players.size > 0 &&
      [...this.state.players.values()].every((player) => player.ready)
    );
  }

  private broadcastSnapshot() {
    if (this.clients.length > 0) this.broadcast('snapshot', this.state.toJSON());
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
    if (side === 1)
      return { x: ARENA.width - margin, y: 70 + Math.random() * (ARENA.height - 140) };
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
