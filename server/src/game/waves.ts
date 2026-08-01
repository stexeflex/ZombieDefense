import {
  PLAYER_BASE_HEALTH,
  SHIELD_SHARE,
  campaignRunReward,
  endlessRunReward,
  endlessWave,
  reserveCapacity,
  startingMoney,
  type MapMission,
  type SpawnPattern,
  type ZombieType,
} from '../../../shared/game-types.js';
import type { BuildSystem } from './build.js';
import type { PlayerSystem } from './players.js';
import type { GameWorld } from './world.js';
import { ObjectiveCoreState } from '../state/game-state.js';

export interface RunReward {
  gold: number;
  runId: string;
  victory: boolean;
  mapId: string;
  wave: number;
}

/** Wave pacing, spawning, run start and the end of a run. */
export class WaveSystem {
  spawnQueue: ZombieType[] = [];
  spawnDelay = 0;
  private spawnPattern: SpawnPattern = 'all';
  private spawnDelayScale = 1;
  private spawnIndex = 0;
  /** Next planned map wave that a timed mission has not released yet. */
  private timedWaveIndex = 0;
  private runId = '';

  constructor(
    private readonly world: GameWorld,
    private readonly players: PlayerSystem,
    private readonly build: BuildSystem,
    private readonly onReward: (reward: RunReward) => void,
    private readonly onClearField: () => void,
  ) {
    world.onObjectiveDestroyed = () => this.endRun(false);
  }

  spawn(delta: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnDelay -= delta;
    if (this.spawnDelay > 0) return;
    if (this.world.atZombieCap()) return;
    const rush = this.world.state.waveKind === 'swarm' ? 0.45 : 1;
    this.spawnDelay = Math.max(
      0.045,
      (0.42 - this.world.state.wave * 0.015) * rush * this.spawnDelayScale,
    );
    const type = this.spawnQueue.shift();
    if (!type) return;
    this.world.spawnZombie(type, undefined, this.nextSpawnSide());
    this.spawnIndex += 1;
  }

  startRun() {
    const state = this.world.state;
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.runId = this.runId;
    state.runGold = 0;
    state.runVictory = false;
    state.wave = 0;
    this.clearRunField();
    this.initializeObjective();
    this.resetPlayers();
    // The squad gets the same untimed preparation phase before wave one that
    // it gets between later waves. The host can still skip the ready votes.
    state.phase = 'build';
    state.waveKind = 'normal';
    state.waveLabel = 'Welle';
    state.enemiesRemaining = 0;
    const timedMission =
      !state.endless && this.world.map.mission?.kind === 'timed'
        ? this.world.map.mission
        : undefined;
    state.statusText = timedMission
      ? `Bauphase · Bereitet euch auf ${Math.round(timedMission.durationSeconds / 60)} Minuten vor`
      : 'Bauphase vor Welle 1 · Baut eure erste Verteidigung';
  }

  /** Put the whole connected squad back into the shared pre-run lobby. */
  returnToLobby() {
    const state = this.world.state;
    this.runId = '';
    state.runId = '';
    state.runGold = 0;
    state.runVictory = false;
    state.wave = 0;
    state.waveKind = 'normal';
    state.waveLabel = 'Welle';
    state.enemiesRemaining = 0;
    state.phase = 'lobby';
    state.totalWaves = state.endless ? 0 : this.world.map.waves.length;
    const timedMission =
      !state.endless && this.world.map.mission?.kind === 'timed'
        ? this.world.map.mission
        : undefined;
    state.statusText = state.endless
      ? `${this.world.map.name} · Endlos`
      : timedMission
        ? `${this.world.map.name} · ${Math.round(timedMission.durationSeconds / 60)} Minuten überleben`
        : `${this.world.map.name} · ${this.world.map.waves.length} Wellen`;
    this.clearRunField();
    this.clearObjective();
    this.resetPlayers();
  }

  private clearRunField() {
    const state = this.world.state;
    this.spawnQueue = [];
    this.spawnDelay = 0;
    this.spawnPattern = 'all';
    this.spawnDelayScale = 1;
    this.spawnIndex = 0;
    this.timedWaveIndex = 0;
    state.zombies.clear();
    state.projectiles.clear();
    state.defenses.clear();
    state.vehicles.clear();
    state.drones.clear();
    state.hazards.clear();
    state.bossName = '';
    state.bossHealth = 0;
    state.bossMaxHealth = 0;
    this.onClearField();
  }

  private resetPlayers() {
    const state = this.world.state;
    let index = 0;
    state.players.forEach((player, id) => {
      const runtime = this.world.runtime.get(id);
      const upgrades = this.world.upgradesOf(id);
      const spawn = this.world.playerSpawn(index++);
      player.x = spawn.x;
      player.y = spawn.y;
      player.maxHealth = Math.round(PLAYER_BASE_HEALTH * (1 + upgrades.maxHealth * 0.02));
      player.health = player.maxHealth;
      player.shieldMax = Math.round(player.maxHealth * SHIELD_SHARE);
      player.shield = 0;
      player.alive = true;
      player.money = startingMoney(upgrades.startMoney);
      player.weapon = 'pistol';
      player.owned.clear();
      player.owned.push('pistol');
      player.weaponRefunds.clear();
      player.ammo = this.players.magazineSize('pistol', upgrades);
      player.reserveAmmo = reserveCapacity('pistol', upgrades.reserveAmmo);
      player.ability = runtime?.ability ?? 'grenade';
      player.abilityMax = this.players.maxAbilityCharges(player.ability, this.world.perksOf(id));
      player.abilityCharges = player.abilityMax;
      player.abilityCooldown = 0;
      player.dashMax = this.players.maxDashes(upgrades);
      player.dashCharges = player.dashMax;
      player.dashCooldown = 0;
      player.dashing = 0;
      player.ready = false;
      player.kills = 0;
      player.reviveProgress = 0;
      player.reloading = 0;
      player.firing = 0;
      player.weaponCharge = 0;
      player.weaponDashing = 0;
      player.hurt = 0;
      player.vehicleId = '';
      if (runtime) {
        runtime.abilityRecharge = [];
        runtime.abilityUseLock = 0;
        runtime.dashRecharge = [];
        runtime.dashLock = 0;
        runtime.wasDashing = false;
        runtime.dashHits.clear();
        runtime.stowed.clear();
        runtime.wasFiring = false;
        runtime.weaponChargeSeconds = 0;
        runtime.chargedWeapon = '';
        runtime.weaponDashSpeed = 0;
        runtime.weaponDashDamage = 0;
        runtime.weaponDashArmorPierce = 0;
        runtime.weaponDashHits.clear();
        runtime.relocatingDefenseId = '';
        runtime.pushX = 0;
        runtime.pushY = 0;
        runtime.lastStandReady = true;
      }
      this.build.resetDiscounts(id);
    });
  }

  private initializeObjective() {
    const state = this.world.state;
    const mission = this.world.map.mission;
    this.clearObjective();
    // Map missions are campaign rules. In endless mode the selected arena
    // keeps its layout and roster without an objective that can end the run.
    if (state.endless || !mission || mission.kind === 'survival') return;

    if (mission.kind === 'timed') {
      state.objectiveKind = mission.kind;
      state.objectiveTitle = mission.title;
      state.objectiveTimeRemaining = mission.durationSeconds;
      state.objectiveDuration = mission.durationSeconds;
      return;
    }

    state.objectiveActive = true;
    state.objectiveKind = mission.kind;
    state.objectiveTitle = mission.title;
    state.objectiveRadius = mission.radius;
    state.objectiveMaxHealth = mission.maxHealth;
    state.objectiveHealth = mission.maxHealth;
    state.objectiveProgress = 0;
    if (mission.kind === 'holdout') {
      state.objectiveX = mission.x;
      state.objectiveY = mission.y;
      return;
    }
    if (mission.kind === 'multiholdout') {
      state.objectiveMaxHealth = mission.maxHealth * mission.cores.length;
      state.objectiveHealth = state.objectiveMaxHealth;
      state.objectiveX =
        mission.cores.reduce((sum, core) => sum + core.x, 0) / Math.max(1, mission.cores.length);
      state.objectiveY =
        mission.cores.reduce((sum, core) => sum + core.y, 0) / Math.max(1, mission.cores.length);
      for (const definition of mission.cores) {
        const core = new ObjectiveCoreState();
        core.id = definition.id;
        core.label = definition.label;
        core.x = definition.x;
        core.y = definition.y;
        core.radius = mission.radius;
        core.health = mission.maxHealth;
        core.maxHealth = mission.maxHealth;
        state.objectiveCores.set(core.id, core);
      }
      return;
    }
    state.objectiveX = mission.path[0]?.x ?? 0;
    state.objectiveY = mission.path[0]?.y ?? 0;
  }

  private clearObjective() {
    const state = this.world.state;
    state.objectiveActive = false;
    state.objectiveKind = '';
    state.objectiveTitle = '';
    state.objectiveX = 0;
    state.objectiveY = 0;
    state.objectiveRadius = 0;
    state.objectiveHealth = 0;
    state.objectiveMaxHealth = 0;
    state.objectiveProgress = 0;
    state.objectiveTimeRemaining = 0;
    state.objectiveDuration = 0;
    state.objectiveCores.clear();
  }

  /**
   * The wagon moves slowly on its own and twice as fast with nearby cover.
   * Enemies close to the hull almost stop it, so clearing the road matters.
   */
  updateMission(delta: number) {
    const state = this.world.state;
    const mission = this.world.map.mission;
    if (!state.endless && mission?.kind === 'timed') {
      this.updateTimedMission(delta, mission);
      return;
    }
    if (
      state.phase !== 'combat' ||
      !state.objectiveActive ||
      !mission ||
      mission.kind !== 'escort' ||
      state.objectiveProgress >= 1
    ) {
      return;
    }

    const checkpoint = Math.min(1, state.wave / Math.max(1, this.world.map.waves.length));
    if (state.objectiveProgress >= checkpoint) return;

    const guarded = this.world
      .livingPlayers()
      .some(
        (player) =>
          Math.hypot(player.x - state.objectiveX, player.y - state.objectiveY) <=
          mission.radius + 260,
      );
    const blocked = [...state.zombies.values()].some(
      (zombie) =>
        Math.hypot(zombie.x - state.objectiveX, zombie.y - state.objectiveY) <=
        mission.radius + 145,
    );
    const distance = this.escortPathLength(mission.path);
    if (distance <= 0) return;
    const pace = mission.speed * (guarded ? 2 : 0.45) * (blocked ? 0.18 : 1);
    state.objectiveProgress = Math.min(
      checkpoint,
      state.objectiveProgress + (pace * delta) / distance,
    );
    const point = this.escortPoint(mission.path, state.objectiveProgress);
    state.objectiveX = point.x;
    state.objectiveY = point.y;
  }

  /**
   * Timed survival never pauses for another build phase. Small, deliberately
   * spaced elite groups enter as the clock advances; clearing the field only
   * buys breathing room. Reaching zero wins even when the final bosses live.
   */
  private updateTimedMission(delta: number, mission: Extract<MapMission, { kind: 'timed' }>) {
    const state = this.world.state;
    if (state.phase !== 'combat' || state.objectiveDuration <= 0) return;

    state.objectiveTimeRemaining = Math.max(0, state.objectiveTimeRemaining - delta);
    const elapsed = state.objectiveDuration - state.objectiveTimeRemaining;
    state.objectiveProgress = Math.min(1, elapsed / state.objectiveDuration);

    while (this.timedWaveIndex < this.world.map.waves.length) {
      const releaseAt = mission.reinforcementTimes[this.timedWaveIndex - 1];
      if (releaseAt === undefined || elapsed < releaseAt) break;
      const definition = this.world.map.waves[this.timedWaveIndex];
      this.spawnQueue.push(...definition.zombies);
      this.spawnPattern = definition.spawnPattern ?? 'all';
      this.spawnDelayScale = definition.spawnDelayScale ?? 1;
      this.spawnDelay = Math.min(this.spawnDelay, 0.25);
      this.spawnIndex = 0;
      this.timedWaveIndex += 1;
      state.wave = this.timedWaveIndex;
      state.waveKind = definition.kind;
      state.waveLabel = definition.label;
      state.statusText =
        definition.kind === 'boss'
          ? `ENDPHASE · Mehrere Bosse gleichzeitig`
          : `${definition.label} · Evakuierung halten`;
      state.runGold = this.rewardGold(false);
    }

    if (state.objectiveTimeRemaining <= 0) this.endRun(true);
  }

  private escortPathLength(path: Array<{ x: number; y: number }>) {
    let total = 0;
    for (let index = 1; index < path.length; index += 1) {
      total += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    }
    return total;
  }

  private escortPoint(path: Array<{ x: number; y: number }>, progress: number) {
    const total = this.escortPathLength(path);
    let remaining = total * Math.max(0, Math.min(1, progress));
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (remaining > length) {
        remaining -= length;
        continue;
      }
      const share = length > 0 ? remaining / length : 0;
      return {
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
      };
    }
    return path[path.length - 1] ?? { x: 0, y: 0 };
  }

  /**
   * The planned waves of the map first, then waves the endless mode makes up on
   * the spot. Nothing left means the campaign is beaten.
   */
  private waveFor(wave: number) {
    const map = this.world.map;
    if (wave <= map.waves.length) return map.waves[wave - 1];
    return this.world.state.endless
      ? endlessWave(map.boss, wave, map.difficulty >= 6 ? 2 : 1, map.enemyMode)
      : undefined;
  }

  startNextWave() {
    const state = this.world.state;
    const definition = this.waveFor(state.wave + 1);
    if (!definition) {
      this.endRun(true);
      return;
    }
    state.phase = 'combat';
    state.wave += 1;
    this.spawnQueue = [...definition.zombies];
    this.spawnDelay = 0.3;
    this.spawnPattern = definition.spawnPattern ?? 'all';
    this.spawnDelayScale = definition.spawnDelayScale ?? 1;
    this.spawnIndex = 0;
    state.waveKind = definition.kind;
    state.waveLabel = definition.label;
    const timed = !state.endless && this.world.map.mission?.kind === 'timed';
    if (timed) this.timedWaveIndex = state.wave;
    state.statusText = timed
      ? `${this.world.map.mission!.title} · ${definition.label}`
      : this.waveStatus(definition.kind, definition.label);
    state.runGold = this.rewardGold(false);
    state.runVictory = false;
    state.players.forEach((player) => {
      player.ready = false;
      const runtime = this.world.runtime.get(player.id);
      if (runtime) {
        runtime.lastStandReady = true;
        runtime.relocatingDefenseId = '';
      }
    });
  }

  private waveStatus(kind: string, label: string) {
    const state = this.world.state;
    const map = this.world.map;
    if (kind === 'boss')
      return state.endless ? `BOSS · Welle ${state.wave}` : `ENDBOSS · ${map.name}`;
    if (kind === 'mini') return `Welle ${state.wave} · Mini-Boss`;
    if (kind === 'swarm') return `Welle ${state.wave} · SCHWARM`;
    if (state.endless) return `Welle ${state.wave} · Endlos`;
    if (label !== 'Welle') return `Welle ${state.wave} · ${label}`;
    return `Welle ${state.wave} / ${map.waves.length}`;
  }

  /** Side ids match GameWorld's edge order: west, east, north, south. */
  private nextSpawnSide() {
    switch (this.spawnPattern) {
      case 'west':
        return 0;
      case 'east':
        return 1;
      case 'north':
        return 2;
      case 'south':
        return 3;
      case 'north-south':
        return this.spawnIndex % 2 === 0 ? 2 : 3;
      case 'east-west':
        return this.spawnIndex % 2 === 0 ? 1 : 0;
      case 'clockwise':
        return [2, 1, 3, 0][this.spawnIndex % 4];
      default:
        return undefined;
    }
  }

  finishWave() {
    const state = this.world.state;
    const map = this.world.map;
    if (!state.endless && state.wave >= map.waves.length) {
      this.endRun(true);
      return;
    }
    // The kind of the wave just cleared is what the state still holds, so no
    // generated wave has to be built a second time just to price it.
    const multiplier = state.waveKind === 'mini' ? 2.1 : state.waveKind === 'swarm' ? 1.5 : 1;
    const reward = Math.round(
      (90 + state.wave * 42) * map.moneyScale * (map.ingameMoneyScale ?? 1) * multiplier,
    );
    state.phase = 'build';
    state.statusText = `Welle geschafft · +${reward} $ für alle`;
    state.projectiles.clear();
    state.hazards.clear();
    state.bossName = '';
    state.bossHealth = 0;
    state.bossMaxHealth = 0;
    if (state.objectiveActive && state.objectiveCores.size > 0) {
      state.objectiveCores.forEach((core) => {
        if (core.health >= core.maxHealth) return;
        core.health = Math.min(core.maxHealth, core.health + core.maxHealth * 0.1);
        this.world.pushFx({ k: 'heal', x: core.x, y: core.y, r: core.radius, s: 'objective' });
      });
      state.objectiveHealth = [...state.objectiveCores.values()].reduce(
        (sum, core) => sum + core.health,
        0,
      );
    } else if (state.objectiveActive && state.objectiveHealth < state.objectiveMaxHealth) {
      state.objectiveHealth = Math.min(
        state.objectiveMaxHealth,
        state.objectiveHealth + state.objectiveMaxHealth * 0.1,
      );
      this.world.pushFx({
        k: 'heal',
        x: state.objectiveX,
        y: state.objectiveY,
        r: state.objectiveRadius,
        s: 'objective',
      });
    }
    state.players.forEach((player) => {
      player.money += reward;
      // The squad goes into the next wave whole: everyone is back on their feet
      // and patched up.
      if (!player.alive || player.health < player.maxHealth) {
        this.world.pushFx({ k: 'heal', x: player.x, y: player.y });
      }
      player.alive = true;
      player.health = player.maxHealth;
      player.reviveProgress = 0;
      player.abilityMax = this.players.maxAbilityCharges(
        player.ability,
        this.world.perksOf(player.id),
      );
      player.abilityCharges = player.abilityMax;
      player.abilityCooldown = 0;
      player.dashCharges = player.dashMax;
      player.dashCooldown = 0;
      player.dashing = 0;
      player.weaponCharge = 0;
      player.weaponDashing = 0;
      player.ready = false;
      const runtime = this.world.runtime.get(player.id);
      if (runtime) {
        runtime.abilityRecharge = [];
        runtime.abilityUseLock = 0;
        runtime.dashRecharge = [];
        runtime.dashLock = 0;
        runtime.pushX = 0;
        runtime.pushY = 0;
        runtime.lastStandReady = true;
      }
    });
    this.onClearField();
  }

  endRun(victory = false) {
    const state = this.world.state;
    if (state.phase === 'gameover') return;
    state.phase = 'gameover';
    state.statusText = victory
      ? `${this.world.map.name} gesichert!`
      : state.endless
        ? `Endlos-Run beendet · Welle ${state.wave}`
        : `Der Run auf ${this.world.map.name} ist vorbei`;
    const reward = this.currentReward(victory);
    if (!reward) return;
    state.runGold = reward.gold;
    state.runVictory = victory;
    this.onReward(reward);
  }

  /**
   * Current payout for a normal defeat or voluntary exit. The stable run id
   * lets the browser reject a duplicate if the regular game-over reward and an
   * exit confirmation cross each other on the wire.
   */
  currentReward(victory = false): RunReward | undefined {
    const state = this.world.state;
    if (!this.runId || state.phase === 'lobby' || state.wave <= 0) return undefined;
    return {
      gold: this.rewardGold(victory),
      runId: this.runId,
      victory,
      mapId: this.world.map.id,
      wave: state.wave,
    };
  }

  private rewardGold(victory: boolean) {
    const state = this.world.state;
    return state.endless
      ? endlessRunReward(this.world.map, state.wave)
      : campaignRunReward(this.world.map, state.wave, victory);
  }

  checkDefeat() {
    const state = this.world.state;
    if (state.phase === 'gameover') return true;
    if (state.players.size === 0) return true;
    const defeated = [...state.players.values()].every((player) => !player.alive);
    if (defeated) this.endRun(false);
    return defeated;
  }

  /** True while the field still holds enemies or the queue still has some. */
  enemiesLeft() {
    const remaining = this.spawnQueue.length + this.world.state.zombies.size;
    const timed = !this.world.state.endless && this.world.map.mission?.kind === 'timed';
    if (timed && this.world.state.objectiveTimeRemaining > 0) return Math.max(1, remaining);
    if (remaining > 0) return remaining;
    const state = this.world.state;
    if (state.objectiveActive && state.objectiveKind === 'escort') {
      const checkpoint = Math.min(1, state.wave / Math.max(1, this.world.map.waves.length));
      if (state.objectiveProgress + 0.0001 < checkpoint) return 1;
    }
    return 0;
  }
}
