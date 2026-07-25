import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import type {
  DefenseType,
  GamePhase,
  WaveKind,
  WeaponType,
  ZombieType,
} from '../../../shared/game-types.js';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') color = '#69f0ae';
  @type('number') x = 640;
  @type('number') y = 360;
  @type('number') rotation = 0;
  @type('number') health = 100;
  @type('number') maxHealth = 100;
  @type('boolean') alive = true;
  @type('number') money = 400;
  @type('string') weapon: WeaponType = 'pistol';
  @type(['string']) owned = new ArraySchema<string>('pistol');
  @type('number') ammo = 12;
  @type('number') reserveAmmo = 96;
  @type('number') grenades = 3;
  @type('number') grenadeCooldown = 0;
  @type('boolean') ready = false;
  @type('number') kills = 0;
  @type('number') reviveProgress = 0;
  @type('number') reloading = 0;
  @type('number') firing = 0;
  @type('number') hurt = 0;
  fireCooldown = 0;
}

export class ZombieState extends Schema {
  @type('string') id = '';
  @type('string') type: ZombieType = 'normal';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') health = 50;
  @type('number') maxHealth = 50;
  @type('number') rotation = 0;
  @type('number') burning = 0;
  @type('number') attacking = 0;
  @type('number') charging = 0;
  speed = 70;
  baseSpeed = 70;
  damage = 12;
  radius = 18;
  reward = 12;
  attackCooldown = 0;
  stuckTimer = 0;
  bestDistance = Infinity;
  lastAttacker = '';
  burnDps = 0;
  slowTimer = 0;
  slowFactor = 1;
  chargeTimer = 4;
  slamTimer = 5;
  summonTimer = 8;
}

export class ProjectileState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') kind = 'bullet';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  damage = 10;
  radius = 4;
  life = 1.2;
  pierce = 0;
  splashRadius = 0;
  splashDamage = 0;
  chain = 0;
  chainRange = 0;
  burn = 0;
  burnSeconds = 0;
  hitIds = new Set<string>();
}

export class DefenseState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') type: DefenseType = 'wood';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') health = 100;
  @type('number') maxHealth = 100;
  @type('number') rotation = 0;
  /** What selling pays: the full price until the next wave starts. */
  @type('number') refund = 0;
  cooldown = 0;
}

export class GameState extends Schema {
  @type('string') phase: GamePhase = 'lobby';
  @type('string') lobbyCode = '';
  @type('string') hostSessionId = '';
  @type('string') mapId = 'outpost';
  @type('number') wave = 0;
  @type('number') totalWaves = 10;
  @type('string') waveLabel = 'Welle';
  @type('string') waveKind: WaveKind = 'normal';
  @type('number') enemiesRemaining = 0;
  @type('string') statusText = 'Warte auf Spieler';
  @type('string') bossName = '';
  @type('number') bossHealth = 0;
  @type('number') bossMaxHealth = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: ZombieState }) zombies = new MapSchema<ZombieState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type({ map: DefenseState }) defenses = new MapSchema<DefenseState>();
}
