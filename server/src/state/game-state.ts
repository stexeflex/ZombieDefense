import { MapSchema, Schema, type } from '@colyseus/schema';
import type {
  DefenseType,
  GamePhase,
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
  @type('number') money = 250;
  @type('string') weapon: WeaponType = 'pistol';
  @type('number') ammo = 12;
  @type('number') reserveAmmo = 72;
  @type('number') grenades = 3;
  @type('number') grenadeCooldown = 0;
  @type('boolean') ready = false;
  @type('number') kills = 0;
  @type('number') reviveProgress = 0;
  @type('number') reloading = 0;
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
  speed = 70;
  damage = 12;
  radius = 18;
  attackCooldown = 0;
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
  penetration = 0;
  hitIds = new Set<string>();
}

export class DefenseState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') type: DefenseType = 'barricade';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') health = 100;
  @type('number') maxHealth = 100;
  @type('number') rotation = 0;
  cooldown = 0;
}

export class GameState extends Schema {
  @type('string') phase: GamePhase = 'lobby';
  @type('string') lobbyCode = '';
  @type('string') hostSessionId = '';
  @type('number') wave = 0;
  @type('number') enemiesRemaining = 0;
  @type('number') nextWaveIn = 0;
  @type('string') statusText = 'Warte auf Spieler';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: ZombieState }) zombies = new MapSchema<ZombieState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type({ map: DefenseState }) defenses = new MapSchema<DefenseState>();
}
