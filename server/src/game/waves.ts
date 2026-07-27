import {
  SHIELD_SHARE,
  campaignRunReward,
  endlessWave,
  reserveCapacity,
  startingMoney,
  type ZombieType,
} from '../../../shared/game-types.js';
import type { BuildSystem } from './build.js';
import type { PlayerSystem } from './players.js';
import type { GameWorld } from './world.js';

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
  private runId = '';

  constructor(
    private readonly world: GameWorld,
    private readonly players: PlayerSystem,
    private readonly build: BuildSystem,
    private readonly onReward: (reward: RunReward) => void,
    private readonly onClearField: () => void,
  ) {}

  spawn(delta: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnDelay -= delta;
    if (this.spawnDelay > 0) return;
    if (this.world.atZombieCap()) return;
    const rush = this.world.state.waveKind === 'swarm' ? 0.45 : 1;
    this.spawnDelay = Math.max(0.08, (0.42 - this.world.state.wave * 0.015) * rush);
    const type = this.spawnQueue.shift();
    if (!type) return;
    this.world.spawnZombie(type);
  }

  startRun() {
    const state = this.world.state;
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.wave = 0;
    state.zombies.clear();
    state.projectiles.clear();
    state.defenses.clear();
    state.hazards.clear();
    state.bossName = '';
    state.bossHealth = 0;
    state.bossMaxHealth = 0;
    let index = 0;
    state.players.forEach((player, id) => {
      const runtime = this.world.runtime.get(id);
      const upgrades = this.world.upgradesOf(id);
      const spawn = this.world.playerSpawn(index++);
      player.x = spawn.x;
      player.y = spawn.y;
      player.maxHealth = Math.round(100 * (1 + upgrades.maxHealth * 0.02));
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
      player.grenades = this.players.maxGrenades(this.world.perksOf(id));
      player.grenadeCooldown = 0;
      player.dashMax = this.players.maxDashes(upgrades);
      player.dashCharges = player.dashMax;
      player.dashCooldown = 0;
      player.dashing = 0;
      player.ready = false;
      player.kills = 0;
      player.reviveProgress = 0;
      player.reloading = 0;
      player.firing = 0;
      player.hurt = 0;
      if (runtime) {
        runtime.grenadeRecharge = [];
        runtime.grenadeThrowLock = 0;
        runtime.dashRecharge = [];
        runtime.dashLock = 0;
        runtime.wasDashing = false;
        runtime.dashHits.clear();
        runtime.stowed.clear();
        runtime.weaponPurchasePrices.clear();
        runtime.wasFiring = false;
        runtime.pushX = 0;
        runtime.pushY = 0;
        runtime.lastStandReady = true;
      }
      this.build.resetDiscounts(id);
    });
    this.startNextWave();
  }

  /**
   * The planned waves of the map first, then waves the endless mode makes up on
   * the spot. Nothing left means the campaign is beaten.
   */
  private waveFor(wave: number) {
    const map = this.world.map;
    if (wave <= map.waves.length) return map.waves[wave - 1];
    return this.world.state.endless ? endlessWave(map.boss, wave) : undefined;
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
    state.waveKind = definition.kind;
    state.waveLabel = definition.label;
    state.statusText = this.waveStatus(definition.kind);
    state.players.forEach((player) => {
      player.ready = false;
      const runtime = this.world.runtime.get(player.id);
      if (runtime) runtime.lastStandReady = true;
    });
  }

  private waveStatus(kind: string) {
    const state = this.world.state;
    const map = this.world.map;
    if (kind === 'boss')
      return state.endless ? `BOSS · Welle ${state.wave}` : `ENDBOSS · ${map.name}`;
    if (kind === 'mini') return `Welle ${state.wave} · Mini-Boss`;
    if (kind === 'swarm') return `Welle ${state.wave} · SCHWARM`;
    if (state.endless) return `Welle ${state.wave} · Endlos`;
    return `Welle ${state.wave} / ${map.waves.length}`;
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
    const reward = Math.round((90 + state.wave * 42) * map.moneyScale * multiplier);
    state.phase = 'build';
    state.statusText = `Welle geschafft · +${reward} $ für alle`;
    state.projectiles.clear();
    state.hazards.clear();
    state.bossName = '';
    state.bossHealth = 0;
    state.bossMaxHealth = 0;
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
      player.grenades = this.players.maxGrenades(this.world.perksOf(player.id));
      player.grenadeCooldown = 0;
      player.dashCharges = player.dashMax;
      player.dashCooldown = 0;
      player.dashing = 0;
      player.ready = false;
      const runtime = this.world.runtime.get(player.id);
      if (runtime) {
        runtime.grenadeRecharge = [];
        runtime.grenadeThrowLock = 0;
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
    const gold = state.endless
      ? Math.round((15 + state.wave * 12) * this.world.map.moneyScale)
      : campaignRunReward(this.world.map, state.wave, victory);
    this.onReward({
      gold,
      runId: this.runId,
      victory,
      mapId: this.world.map.id,
      wave: state.wave,
    });
  }

  /** Keep the room and squad together while returning to the pre-run lobby. */
  returnToLobby() {
    const state = this.world.state;
    if (state.phase !== 'gameover') return;
    state.phase = 'lobby';
    state.wave = 0;
    state.waveKind = 'normal';
    state.waveLabel = 'Welle';
    state.enemiesRemaining = 0;
    state.zombies.clear();
    state.projectiles.clear();
    state.defenses.clear();
    state.hazards.clear();
    state.bossName = '';
    state.bossHealth = 0;
    state.bossMaxHealth = 0;
    state.statusText = state.endless
      ? `${this.world.map.name} · Endlos`
      : `${this.world.map.name} · ${this.world.map.waves.length} Wellen`;
    state.players.forEach((player) => {
      player.ready = false;
      player.reloading = 0;
      player.firing = 0;
    });
    this.onClearField();
  }

  checkDefeat() {
    const state = this.world.state;
    if (state.players.size === 0) return true;
    const defeated = [...state.players.values()].every((player) => !player.alive);
    if (defeated) this.endRun(false);
    return defeated;
  }

  /** True while the field still holds enemies or the queue still has some. */
  enemiesLeft() {
    return this.spawnQueue.length + this.world.state.zombies.size;
  }
}
