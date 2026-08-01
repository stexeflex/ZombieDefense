/**
 * Headless-Rauchtest für die Spiellogik.
 *
 * Startet echte Räume ohne Netzwerk, spielt Wellen mit einem Bot durch und
 * prüft Waffen, Verteidigungen, Dash, Bosse und den Weg bis zum Endboss.
 * Nützlich nach Änderungen an Balancing oder Server-Logik.
 *
 * Aufruf: npm run sim
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);

const { ZombieRoom } = await load('server/build/server/src/rooms/zombie-room.js');
const {
  ARENA,
  BOSSES,
  DASH_BASE_RESIST,
  DASH_SECONDS,
  DEFENSES,
  MAPS,
  MINI_BOSSES,
  PLACE_RANGE,
  REPAIR_COST_PER_HP,
  STARTER_BARRICADE_COUNT,
  STARTER_DISCOUNT,
  TURRET_ORDER,
  VEHICLES,
  VEHICLE_ORDER,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  ammoRefillCost,
  campaignRunReward,
  canPlaceDefense,
  dashReduction,
  endlessDamageScale,
  endlessHealthScale,
  endlessRunReward,
  endlessSpeedScale,
  healthRegenPerSecond,
  isMeleeWeapon,
  magazineCapacity,
  reserveCapacity,
  sellValue,
  startingMoney,
  upgradeMaxLevel,
  weaponSellValue,
} = await load('server/build/shared/game-types.js');

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`  FEHLER ${name} ${detail}`);
}

function makeRoom(mapId, options = {}) {
  const room = new ZombieRoom();
  room.clients = [];
  room.broadcast = () => {};
  room.setSimulationInterval = () => {};
  room.onCreate({ lobbyCode: 'SIM01', mapId, ...options });
  return room;
}

function join(room, id, options = {}) {
  room.onJoin({ sessionId: id }, { name: id, upgrades: {}, perks: {}, ...options });
  return room.state.players.get(id);
}

const IDLE = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  reload: false,
  dash: false,
  aimX: 0,
  aimY: 0,
};

function aimAtNearest(room, id) {
  const player = room.state.players.get(id);
  const runtime = room.systems.world.runtime.get(id);
  let best;
  let bestDistance = Infinity;
  room.state.zombies.forEach((zombie) => {
    const distance = Math.hypot(zombie.x - player.x, zombie.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zombie;
    }
  });
  runtime.input = {
    ...IDLE,
    shoot: Boolean(best),
    aimX: best ? best.x : player.x + 100,
    aimY: best ? best.y : player.y,
  };
}

function step(room, ticks, id) {
  for (let index = 0; index < ticks; index += 1) {
    if (id) aimAtNearest(room, id);
    room.update(50);
  }
}

function makeInvincible(player) {
  player.health = 1e9;
  player.maxHealth = 1e9;
}

function startCombat(room) {
  room.systems.waves.startRun();
  room.systems.waves.startNextWave();
}

function roomWithTurret(type) {
  const room = makeRoom('crater');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeDefense('p1', { type, x: 1200, y: 900, rotation: 0 });
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  return { room, player };
}

console.log('\n== Echtzeit-Spielschritt ==');
{
  const room = new ZombieRoom();
  room.clients = [];
  room.broadcast = () => {};
  room.onCreate({ lobbyCode: 'CLOCK', mapId: 'outpost' });
  const player = join(room, 'clock-player');
  room.systems.waves.startRun();
  const runtime = room.systems.world.runtime.get(player.id);
  runtime.input = { ...IDLE, right: true, aimX: player.x + 100, aimY: player.y };
  const startX = player.x;
  await new Promise((resolve) => setTimeout(resolve, 300));
  room.setSimulationInterval();
  const travelled = player.x - startX;
  check(
    'Serverbewegung erhält die volle verstrichene Zeit',
    travelled > 40,
    `(${Math.round(travelled)} px in 300 ms)`,
  );
  check(
    'Dabei bleibt der ungenutzte Colyseus-Doppelkanal aus',
    room.patchRate === null,
    `(Patchrate ${room.patchRate})`,
  );
}

console.log('\n== Erste Welle auf Vorposten 07 ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  check(
    'Kompakte Snapshots ersetzen den ungenutzten Colyseus-Doppelkanal',
    room.patchRate === null,
    `(Patchrate ${room.patchRate})`,
  );
  room.systems.waves.startRun();
  check(
    'Run beginnt mit Bauphase vor Welle 1',
    room.state.phase === 'build' && room.state.wave === 0 && room.state.enemiesRemaining === 0,
    `(${room.state.phase}, Welle ${room.state.wave})`,
  );
  room.systems.waves.startNextWave();
  check('Kampfphase gestartet', room.state.phase === 'combat');

  let ticks = 0;
  while (room.state.phase === 'combat' && ticks < 6000) {
    makeInvincible(player);
    player.weapon = 'laser';
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    step(room, 1, 'p1');
    ticks += 1;
  }
  check('Welle endet', room.state.phase === 'build', `(${room.state.phase})`);
  check('Abschüsse gezählt', player.kills > 0);
  check('Geld verdient', player.money > 400);
  console.log(`  info ${ticks} Ticks, ${player.kills} Abschüsse, ${player.money} $`);
}

console.log('\n== Sichere Spawns und Kartenwände ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
  player.money = 1e6;
  player.x = 200;
  player.y = 800;
  room.systems.build.placeDefense('p1', { type: 'mg', x: 70, y: 800, rotation: 0 });
  const defense = [...room.state.defenses.values()][0];
  const entries = Array.from({ length: 80 }, () => room.systems.world.edgeSpawn(20));
  const nearest = Math.min(
    ...entries.map((spawn) => Math.hypot(spawn.x - defense.x, spawn.y - defense.y)),
  );
  check(
    'Explodierer spawnen außerhalb ihres Schadensradius zu Bauten',
    nearest > ZOMBIES.exploder.explode.radius,
    `(${Math.round(nearest)} px Abstand)`,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  makeInvincible(player);
  const wall = room.systems.world.map.obstacles.find(
    (obstacle) => obstacle.solid && obstacle.kind === 'wall' && obstacle.w > obstacle.h,
  );
  const brute = room.systems.world.spawnZombie('brute', {
    x: wall.x,
    y: wall.y - wall.h / 2 - ZOMBIES.brute.radius - 2,
  });
  player.x = wall.x;
  player.y = wall.y + 320;
  brute.charging = 1;
  brute.chargeSpeed = 3000;
  room.update(50);
  const crossedThrough =
    brute.x > wall.x - wall.w / 2 - brute.radius &&
    brute.x < wall.x + wall.w / 2 + brute.radius &&
    brute.y > wall.y + wall.h / 2 + brute.radius;
  check(
    'Auch ein schneller Sturmangriff tunnelt nicht durch kleine Kartenwände',
    !crossedThrough && !room.systems.world.circleOverlapsRect(brute.x, brute.y, brute.radius, wall),
    `(${Math.round(brute.x)}, ${Math.round(brute.y)})`,
  );
}

console.log('\n== Alle Waffen treffen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  makeInvincible(player);

  for (const weapon of WEAPON_ORDER) {
    // A very strong weapon may clear the pack and end the wave; the next
    // weapon still needs a combat phase for its isolated firing check.
    room.state.phase = 'combat';
    room.state.zombies.clear();
    room.state.projectiles.clear();
    const pack = [];
    const firstX = isMeleeWeapon(weapon) ? 660 : 760;
    for (let index = 0; index < 8; index += 1) {
      const zombie = room.systems.world.spawnZombie('normal', {
        x: firstX + index * 26,
        y: 800,
      });
      zombie.health = 400;
      zombie.maxHealth = 400;
      pack.push(zombie);
    }
    player.x = 600;
    player.y = 800;
    player.weapon = weapon;
    player.fireCooldown = 0;
    const before = pack.reduce((sum, zombie) => sum + zombie.health, 0);
    const runtime = room.systems.world.runtime.get('p1');
    for (let tick = 0; tick < 40; tick += 1) {
      pack.forEach((zombie, index) => {
        zombie.x = firstX + index * 26;
        zombie.y = 800;
      });
      player.ammo = 9999;
      player.reserveAmmo = 9999;
      player.reloading = 0;
      runtime.input = { ...IDLE, shoot: true, aimX: firstX, aimY: 800 };
      room.update(50);
    }
    if (WEAPONS[weapon].charge) {
      runtime.input = { ...IDLE, shoot: false, aimX: firstX, aimY: 800 };
      for (let tick = 0; tick < 30; tick += 1) {
        pack.forEach((zombie, index) => {
          zombie.x = firstX + index * 26;
          zombie.y = 800;
        });
        room.update(50);
      }
    }
    const after = pack.reduce((sum, zombie) => sum + Math.max(0, zombie.health), 0);
    check(
      `${WEAPONS[weapon].label} trifft (~${Math.round((before - after) / 2)} Schaden/s)`,
      after < before,
    );
  }
}

console.log('\n== Aufladewaffen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  player.weapon = 'dashknife';
  player.health = player.maxHealth = 1000;
  player.x = 600;
  player.y = 800;
  for (let tick = 0; tick < 20; tick += 1) {
    runtime.input = { ...IDLE, shoot: true, aimX: 1000, aimY: 800 };
    room.update(50);
  }
  runtime.input = { ...IDLE, shoot: false, aimX: 1000, aimY: 800 };
  room.update(50);
  const landed = room.systems.world.damagePlayer(player, 250);
  check(
    'Dashmesser macht während des geladenen Angriffs unverwundbar',
    player.weaponDashing > 0 && !landed && player.health === 1000,
  );
}

console.log('\n== Verteidigungen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;

  const types = Object.keys(DEFENSES);
  types.forEach((type) => {
    const before = room.state.defenses.size;
    for (let row = 0; row < 7 && room.state.defenses.size === before; row += 1) {
      for (let column = 0; column < 9 && room.state.defenses.size === before; column += 1) {
        room.systems.build.placeDefense('p1', {
          type,
          x: 920 + column * 70,
          y: 940 + row * 70,
          rotation: 0,
        });
      }
    }
  });
  check(
    'Jede Verteidigung lässt sich bauen',
    room.state.defenses.size === types.length,
    `(${room.state.defenses.size}/${types.length})`,
  );

  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  makeInvincible(player);
  for (let index = 0; index < 25; index += 1) {
    room.systems.world.spawnZombie('normal', { x: 1150 + index * 12, y: 1000 });
  }
  step(room, 400, 'p1');
  check('Zombies werden bekämpft', room.state.zombies.size < 25, `(${room.state.zombies.size})`);
}

console.log('\n== Besondere Türme wirken ==');
for (const type of [
  'flame',
  'frost',
  'scatter',
  'mortar',
  'shotgun',
  'acid',
  'tesla',
  'launcher',
  'triple',
  'laser',
  'drone',
  'precision_mortar',
  'longshot',
  'plasma',
  'shockwave',
  'ring',
  'ion_bastion',
  'gravity_well',
  'chrono',
  'executioner',
  'focus',
]) {
  const room = makeRoom('crater');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeDefense('p1', { type, x: 1200, y: 900, rotation: 0 });
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);

  const pack = [];
  for (let index = 0; index < 6; index += 1) {
    const zombie = room.systems.world.spawnZombie('normal', { x: 1160 + index * 22, y: 1010 });
    zombie.health = 1500;
    zombie.maxHealth = 1500;
    pack.push(zombie);
  }
  const before = pack.reduce((sum, zombie) => sum + zombie.health, 0);
  const runtime = room.systems.world.runtime.get('p1');
  for (let tick = 0; tick < 120; tick += 1) {
    pack.forEach((zombie, index) => {
      zombie.x = 1160 + index * 22;
      zombie.y = 1010;
    });
    runtime.input = { ...IDLE };
    room.update(50);
  }
  const after = pack.reduce((sum, zombie) => sum + Math.max(0, zombie.health), 0);
  check(
    `${DEFENSES[type].label} bekämpft Gegner (${Math.round(before - after)} Schaden)`,
    after < before,
    `(${after}/${before})`,
  );
}

console.log('\n== Endgame-Türme haben eigene Mechaniken ==');
{
  const { room } = roomWithTurret('gravity_well');
  const anchor = room.systems.world.spawnZombie('normal', { x: 1200, y: 1050 });
  const dragged = room.systems.world.spawnZombie('normal', { x: 1390, y: 1050 });
  for (const zombie of [anchor, dragged]) {
    zombie.health = 100000;
    zombie.maxHealth = 100000;
    zombie.speed = 0;
    zombie.baseSpeed = 0;
  }
  const beforeX = dragged.x;
  room.systems.turrets.update(0.05);
  room.systems.projectiles.update(0.35);
  check('Gravitationskanone zieht Nachbarn zum Einschlag', dragged.x < beforeX, `(${dragged.x})`);
  check('Gravitationskanone verlangsamt den Einschlag', dragged.chilled > 0);
}
{
  const { room } = roomWithTurret('chrono');
  const targets = [
    room.systems.world.spawnZombie('normal', { x: 1120, y: 1070 }),
    room.systems.world.spawnZombie('normal', { x: 1320, y: 980 }),
  ];
  for (const zombie of targets) {
    zombie.health = 10000;
    zombie.maxHealth = 10000;
  }
  room.systems.turrets.update(0.05);
  check(
    'Chronosphäre trifft alle Ziele gleichzeitig',
    targets.every((zombie) => zombie.health < 10000),
  );
  check(
    'Chronosphäre friert alle getroffenen Ziele ein',
    targets.every((zombie) => zombie.chilled > 3),
  );
}
{
  const { room } = roomWithTurret('executioner');
  const healthy = room.systems.world.spawnZombie('normal', { x: 1200, y: 1100 });
  const wounded = room.systems.world.spawnZombie('normal', { x: 1450, y: 900 });
  healthy.health = healthy.maxHealth = 50000;
  wounded.maxHealth = 50000;
  wounded.health = 10000;
  room.systems.turrets.update(0.05);
  room.systems.projectiles.update(0.1);
  check(
    'Hinrichter wählt das verwundetste Ziel',
    wounded.health < 10000 && healthy.health === 50000,
  );
  check(
    'Hinrichter verstärkt Schaden bei fehlendem Leben',
    10000 - wounded.health > DEFENSES.executioner.damage,
  );
}
{
  const { room } = roomWithTurret('focus');
  const target = room.systems.world.spawnZombie('normal', { x: 1450, y: 900 });
  target.health = target.maxHealth = 100000;
  room.systems.turrets.update(0.05);
  room.systems.projectiles.update(0.1);
  const firstHit = 100000 - target.health;
  const afterFirst = target.health;
  room.systems.turrets.update(1);
  room.systems.projectiles.update(0.1);
  const secondHit = afterFirst - target.health;
  check(
    'Omega-Fokus steigert Folgetreffer auf dasselbe Ziel',
    secondHit > firstHit * 1.3,
    `(${firstHit}/${secondHit})`,
  );
}

console.log('\n== Neue Störgegner ==');
{
  const { room } = roomWithTurret('mg');
  const turret = [...room.state.defenses.values()][0];
  turret.cooldown = 1;
  const jammer = room.systems.world.spawnZombie('jammer', { x: turret.x, y: turret.y + 120 });
  jammer.health = jammer.maxHealth = 100000;
  room.systems.turrets.update(0.2);
  const slowedCooldown = turret.cooldown;
  room.state.zombies.clear();
  turret.cooldown = 1;
  room.systems.turrets.update(0.2);
  check(
    'Störseucher verlangsamt nahe Geschütztürme',
    slowedCooldown > turret.cooldown,
    `(${slowedCooldown.toFixed(2)} statt ${turret.cooldown.toFixed(2)})`,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  player.alive = false;
  const blink = room.systems.world.spawnZombie('blink', { x: 1200, y: 800 });
  blink.health = blink.maxHealth = 100000;
  blink.rotation = 0;
  const start = { x: blink.x, y: blink.y };
  room.systems.world.damageZombie(blink.id, blink, 1, 'p1');
  const firstDash = Math.hypot(blink.x - start.x, blink.y - start.y);
  const afterFirst = { x: blink.x, y: blink.y };
  room.systems.world.damageZombie(blink.id, blink, 1, 'p1');
  const prematureDash = Math.hypot(blink.x - afterFirst.x, blink.y - afterFirst.y);
  room.systems.zombies.update(1.01);
  room.systems.world.damageZombie(blink.id, blink, 1, 'p1');
  const secondDash = Math.hypot(blink.x - afterFirst.x, blink.y - afterFirst.y);
  check(
    'Sprunghetzer weicht dem ersten Treffer aus',
    firstDash > 100,
    `(${firstDash.toFixed(0)} px)`,
  );
  check('Sprunghetzer weicht innerhalb einer Sekunde nicht erneut aus', prematureDash < 1);
  check('Sprunghetzer kann nach einer Sekunde wieder ausweichen', secondDash > 100);
}

console.log('\n== Drei Signalkerne ==');
{
  const room = makeRoom('trinity');
  join(room, 'p1');
  room.systems.waves.startRun();
  const nearest = room.systems.world.nearestObjective(250, 800);
  check('Alle drei Signalkerne werden einzeln aufgebaut', room.state.objectiveCores.size === 3);
  check('Die Horde wählt den nächsten Signalkern', nearest?.id === 'west', `(${nearest?.id})`);
  room.systems.world.damageObjective(1e9, 'west');
  check('Der Verlust eines einzelnen Kerns beendet den Run', room.state.phase === 'gameover');
}

console.log('\n== Säure, Feuer und Magnum ==');
{
  // Der Säurewerfer zündet nichts mehr an, er lässt Lachen liegen.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  room.state.hazards.clear();
  makeInvincible(player);
  player.x = 1200;
  player.y = 800;
  player.weapon = 'acid';

  const target = room.systems.world.spawnZombie('normal', { x: 1500, y: 800 });
  target.health = 40000;
  target.maxHealth = 40000;
  for (let tick = 0; tick < 16; tick += 1) {
    target.x = 1500;
    target.y = 800;
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    runtime.input = { ...IDLE, shoot: true, aimX: 1500, aimY: 800 };
    room.update(50);
  }
  const pool = [...room.state.hazards.values()].find((hazard) => hazard.kind === 'acid');
  check('Säure hinterlässt türkise Lachen', Boolean(pool), `(${room.state.hazards.size})`);
  check('Säure entzündet niemanden mehr', target.burning === 0, `(${target.burning})`);

  runtime.input = { ...IDLE };
  room.state.projectiles.clear();
  const beforePool = target.health;
  for (let tick = 0; tick < 20; tick += 1) {
    target.x = pool ? pool.x : 1500;
    target.y = pool ? pool.y : 800;
    room.update(50);
  }
  check(
    'Die Lache frisst weiter, ohne dass jemand schießt',
    target.health < beforePool,
    `(${Math.round(beforePool - target.health)} Schaden)`,
  );

  // Es ist die eigene Säure: der Trupp darf ruhig hindurchlaufen.
  room.state.zombies.clear();
  room.state.projectiles.clear();
  player.maxHealth = 500;
  player.health = 500;
  player.x = pool ? pool.x : 1500;
  player.y = pool ? pool.y : 800;
  step(room, 20);
  check('Die eigene Säure tut dem Trupp nichts', player.health === 500, `(${player.health}/500)`);
}
{
  // Die Feuerrakete macht genau das, was die Säure vorher gemacht hat.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  room.state.hazards.clear();
  makeInvincible(player);
  player.x = 1200;
  player.y = 800;
  player.weapon = 'firerocket';

  const target = room.systems.world.spawnZombie('big', { x: 1500, y: 800 });
  target.health = 40000;
  target.maxHealth = 40000;
  for (let tick = 0; tick < 30; tick += 1) {
    target.x = 1500;
    target.y = 800;
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    runtime.input = { ...IDLE, shoot: true, aimX: 1500, aimY: 800 };
    room.update(50);
  }
  check('Feuerrakete setzt Gegner in Brand', target.burning > 0, `(${target.burning})`);
  check('Feuerrakete trifft hart', target.health < target.maxHealth);
  check(
    'Feuerrakete lässt keine Säure liegen',
    ![...room.state.hazards.values()].some((hazard) => hazard.kind === 'acid'),
  );
}
{
  // Zwei Gegner in einer Linie: die Magnum bleibt im ersten stecken.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  player.x = 1200;
  player.y = 800;

  const line = (weapon) => {
    room.state.zombies.clear();
    room.state.projectiles.clear();
    const front = room.systems.world.spawnZombie('big', { x: 1400, y: 800 });
    const back = room.systems.world.spawnZombie('big', { x: 1470, y: 800 });
    for (const zombie of [front, back]) {
      zombie.health = 1e6;
      zombie.maxHealth = 1e6;
    }
    player.weapon = weapon;
    player.fireCooldown = 0;
    for (let tick = 0; tick < 24; tick += 1) {
      front.x = 1400;
      front.y = 800;
      back.x = 1470;
      back.y = 800;
      player.ammo = 9999;
      player.reserveAmmo = 9999;
      player.reloading = 0;
      runtime.input = { ...IDLE, shoot: true, aimX: 1400, aimY: 800 };
      room.update(50);
    }
    return { front: 1e6 - front.health, back: 1e6 - back.health };
  };

  const magnum = line('magnum');
  check(
    'Magnum trifft den vorderen Gegner hart',
    magnum.front > 200,
    `(${Math.round(magnum.front)})`,
  );
  check('Magnum durchschlägt niemanden', magnum.back === 0, `(${Math.round(magnum.back)})`);
  const elephant = line('elephant');
  check(
    'Elefantenbüchse richtet extremen Einzelschaden an',
    elephant.front >= WEAPONS.elephant.damage,
    `(${Math.round(elephant.front)})`,
  );
  check(
    'Elefantenbüchse bleibt im ersten Gegner stecken',
    elephant.back === 0,
    `(${Math.round(elephant.back)})`,
  );
  check(
    'Elefantenbüchse hat nur zehn Schuss',
    WEAPONS.elephant.magazine + WEAPONS.elephant.reserve === 10,
  );
  const nailgun = line('nailgun');
  check(
    'Zum Vergleich: der Nagelwerfer geht durch',
    nailgun.back > 0,
    `(${Math.round(nailgun.back)})`,
  );
}

console.log('\n== Drohnenhangar ==');
{
  const room = makeRoom('crater');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeDefense('p1', { type: 'drone', x: 1200, y: 900, rotation: 0 });
  const hangar = [...room.state.defenses.values()][0];
  room.update(50);
  check(
    'Der Hangar startet seine Drohnen',
    room.state.drones.size === DEFENSES.drone.drones,
    `(${room.state.drones.size}/${DEFENSES.drone.drones})`,
  );

  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  const pack = [];
  for (let index = 0; index < 3; index += 1) {
    const zombie = room.systems.world.spawnZombie('normal', { x: 1520, y: 740 + index * 60 });
    zombie.health = 4000;
    zombie.maxHealth = 4000;
    pack.push(zombie);
  }
  const start = [...room.state.drones.values()].map((drone) => ({ x: drone.x, y: drone.y }));
  const runtime = room.systems.world.runtime.get('p1');
  for (let tick = 0; tick < 200; tick += 1) {
    pack.forEach((zombie, index) => {
      zombie.x = 1520;
      zombie.y = 740 + index * 60;
    });
    runtime.input = { ...IDLE };
    room.update(50);
  }
  const flown = [...room.state.drones.values()].map((drone, index) =>
    Math.hypot(drone.x - start[index].x, drone.y - start[index].y),
  );
  check(
    'Die Drohnen fliegen selbst los',
    flown.every((distance) => distance > 120),
    `(${flown.map((d) => Math.round(d)).join(', ')} px)`,
  );
  check(
    'Die Drohnen bleiben an der Leine ihres Hangars',
    [...room.state.drones.values()].every(
      (drone) => Math.hypot(drone.x - hangar.x, drone.y - hangar.y) <= DEFENSES.drone.range + 200,
    ),
  );
  check(
    'Jede Drohne nimmt sich ein eigenes Ziel vor',
    pack.every((zombie) => zombie.health < 4000),
    `(${pack.map((z) => Math.round(z.health)).join(', ')} HP)`,
  );

  room.systems.world.destroyDefense(hangar);
  room.update(50);
  check('Mit dem Hangar verschwinden die Drohnen', room.state.drones.size === 0);
}

console.log('\n== Fahrzeuge ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;

  // Jedes Fahrzeug muss sich abstellen lassen, mit genug Abstand zum nächsten.
  let parked = 0;
  VEHICLE_ORDER.forEach((type) => {
    const targetCount = parked + 1;
    for (let y = 220; y <= ARENA.height - 220 && parked < targetCount; y += 170) {
      for (let x = 220; x <= ARENA.width - 220; x += 180) {
        const before = room.state.vehicles.size;
        player.x = x - 100;
        player.y = y;
        room.systems.build.placeVehicle('p1', { type, x, y, rotation: 0 });
        if (room.state.vehicles.size > before) {
          parked += 1;
          break;
        }
      }
    }
  });
  check(
    'Jedes Fahrzeug lässt sich kaufen und abstellen',
    parked === VEHICLE_ORDER.length,
    `(${parked}/${VEHICLE_ORDER.length})`,
  );

  const [first] = [...room.state.vehicles.values()];
  const price = VEHICLES[first.type].cost;
  const beforeSell = player.money;
  player.x = first.x;
  player.y = first.y + 60;
  room.systems.build.sellDefense('p1', first.id);
  check(
    'Frisch gekauftes Fahrzeug zahlt den vollen Preis zurück',
    !room.state.vehicles.has(first.id) && player.money === beforeSell + price,
    `(+${player.money - beforeSell} statt +${price})`,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'car', x: 1260, y: 800, rotation: 0 });
  const car = [...room.state.vehicles.values()][0];

  room.systems.vehicles.toggle('p1');
  check('Einsteigen klappt in Reichweite', player.vehicleId === car.id && car.crew.length === 1);

  const startX = car.x;
  runtime.input = { ...IDLE, right: true, aimX: player.x + 300, aimY: player.y };
  step(room, 30);
  check('Fahren bewegt die Hülle', car.x - startX > 100, `(${Math.round(car.x - startX)} px)`);
  check(
    'Die Besatzung fährt mit',
    Math.abs(player.x - car.x) < 1 && Math.abs(player.y - car.y) < 1,
  );

  // Ein zweiter Spieler passt mit rein, ein dritter nicht mehr.
  const mate = join(room, 'p2');
  mate.x = car.x;
  mate.y = car.y + 20;
  room.systems.vehicles.toggle('p2');
  check('Mitspieler steigt zu', car.crew.length === 2 && mate.vehicleId === car.id);
  const third = join(room, 'p3');
  third.x = car.x;
  third.y = car.y + 20;
  room.systems.vehicles.toggle('p3');
  check(
    'Ein voller Wagen nimmt niemanden mehr auf',
    car.crew.length === 2 && third.vehicleId === '',
    `(${car.crew.length}/${VEHICLES.car.seats})`,
  );
  check(
    'Ein besetztes Fahrzeug lässt sich nicht verkaufen',
    (() => {
      const before = player.money;
      room.systems.build.sellDefense('p1', car.id);
      return room.state.vehicles.has(car.id) && player.money === before;
    })(),
  );

  runtime.input = { ...IDLE };
  room.systems.vehicles.toggle('p1');
  check(
    'Aussteigen setzt den Spieler neben die Hülle',
    player.vehicleId === '' && Math.hypot(player.x - car.x, player.y - car.y) > 20,
  );
  check('Der Mitfahrer übernimmt das Steuer', car.crew[0] === 'p2');
}
{
  // Panzerung, Rammschaden und das Wrack.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'apc', x: 1260, y: 800, rotation: 0 });
  const apc = [...room.state.vehicles.values()][0];
  room.systems.vehicles.toggle('p1');

  player.maxHealth = 1000;
  player.health = 1000;
  const hullBeforeMelee = apc.health;
  const landed = room.systems.world.damagePlayer(player, 100);
  room.systems.world.hullMelee(apc, 100);
  check(
    'Im Fahrzeug ist die Besatzung vollständig unverwundbar',
    landed === false && player.health === 1000,
    `(${player.health}/1000 HP)`,
  );
  check('Nahkampftreffer landen nur auf der Hülle', apc.health < hullBeforeMelee);

  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  const victim = room.systems.world.spawnZombie('normal', { x: apc.x + 260, y: apc.y });
  victim.health = 1e6;
  victim.maxHealth = 1e6;
  const hullBefore = apc.health;
  runtime.input = { ...IDLE, right: true, aimX: apc.x + 400, aimY: apc.y };
  step(room, 40);
  check(
    'Überfahren verletzt den Gegner',
    victim.health < 1e6,
    `(${Math.round(1e6 - victim.health)} Schaden)`,
  );
  check('Und kostet die Karosserie Leben', apc.health < hullBefore);

  const crewHealth = player.health;
  room.systems.world.damageVehicle(apc, apc.health);
  check(
    'Ein zerstörtes Fahrzeug wirft die Besatzung raus und tut weh',
    !room.state.vehicles.has(apc.id) && player.vehicleId === '' && player.health < crewHealth,
  );
}
{
  // Bordwaffe, Bordlazarett und die fahrende Werkstatt.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'pickup', x: 1260, y: 800, rotation: 0 });
  const pickup = [...room.state.vehicles.values()][0];
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);

  const target = room.systems.world.spawnZombie('normal', { x: pickup.x + 200, y: pickup.y });
  target.health = 1e6;
  target.maxHealth = 1e6;
  step(room, 20);
  check('Eine leere Hülle schießt nicht', target.health === 1e6);
  room.systems.vehicles.toggle('p1');
  step(room, 20);
  check('Mit Besatzung feuert das MG von allein', target.health < 1e6);
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'van', x: 1280, y: 800, rotation: 0 });
  room.systems.build.placeDefense('p1', { type: 'wood', x: 1200, y: 950, rotation: 0 });
  const wall = [...room.state.defenses.values()][0];
  wall.health = 100;
  room.systems.vehicles.toggle('p1');
  room.systems.waves.startNextWave();
  // Ein Eintrag in der Warteschlange hält die Welle offen, die riesige
  // Spawn-Pause sorgt dafür, dass trotzdem kein Gegner auftaucht.
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  player.health = 50;
  step(room, 40);
  check(
    'Der Mannschaftswagen heilt seine Besatzung',
    player.health > 50 && player.health < player.maxHealth,
    `(${Math.round(player.health)} HP)`,
  );
  check('Aber er repariert nichts', wall.health === 100);

  const workshopRoom = makeRoom('outpost');
  const mechanic = join(workshopRoom, 'p1');
  startCombat(workshopRoom);
  workshopRoom.systems.waves.finishWave();
  mechanic.money = 1e6;
  mechanic.x = 1200;
  mechanic.y = 800;
  workshopRoom.systems.build.placeVehicle('p1', {
    type: 'workshop',
    x: 1290,
    y: 800,
    rotation: 0,
  });
  workshopRoom.systems.build.placeDefense('p1', { type: 'wood', x: 1200, y: 950, rotation: 0 });
  const damaged = [...workshopRoom.state.defenses.values()][0];
  damaged.health = 100;
  workshopRoom.systems.build.buyWeapon('p1', 'rifle');
  mechanic.reserveAmmo = 5;
  workshopRoom.systems.vehicles.toggle('p1');
  workshopRoom.systems.waves.startNextWave();
  workshopRoom.systems.waves.spawnQueue = ['normal'];
  workshopRoom.systems.waves.spawnDelay = 1e6;
  workshopRoom.state.zombies.clear();
  step(workshopRoom, 60);
  check(
    'Der Werkstattwagen flickt Bauten in der Nähe',
    damaged.health > 100,
    `(${Math.round(damaged.health)} HP)`,
  );
  check('Und liefert Munition nach', mechanic.reserveAmmo > 5, `(${mechanic.reserveAmmo} Schuss)`);
}
{
  // Der Dash bleibt zu Fuß, im Fahrzeug wird daraus das Nitro.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'quad', x: 1250, y: 800, rotation: 0 });
  const quad = [...room.state.vehicles.values()][0];
  room.systems.vehicles.toggle('p1');

  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 300, aimY: player.y };
  room.update(50);
  check(
    'Im Fahrzeug wird aus dem Dash ein Nitro',
    quad.boost > 0 && player.dashing === 0 && player.dashCharges === 1,
    `(Boost ${quad.boost.toFixed(2)} s, ${player.dashCharges} Ladungen)`,
  );

  const heavyRoom = makeRoom('outpost');
  const heavyPlayer = join(heavyRoom, 'p1');
  const heavyRuntime = heavyRoom.systems.world.runtime.get('p1');
  startCombat(heavyRoom);
  heavyRoom.systems.waves.finishWave();
  heavyPlayer.money = 1e6;
  heavyPlayer.x = 1200;
  heavyPlayer.y = 800;
  heavyRoom.systems.build.placeVehicle('p1', { type: 'tank', x: 1280, y: 800, rotation: 0 });
  heavyRoom.systems.vehicles.toggle('p1');
  heavyRuntime.input = { ...IDLE, dash: true, right: true, aimX: 1600, aimY: 800 };
  heavyRoom.update(50);
  check(
    'Ohne Nitro verpufft die Dash-Taste nicht die Ladung',
    heavyPlayer.dashCharges === 2 && heavyPlayer.dashing === 0,
    `(${heavyPlayer.dashCharges} Ladungen)`,
  );
}
{
  // Zombies reißen die Hülle auf, statt durch sie hindurchzulaufen.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'car', x: 1280, y: 800, rotation: 0 });
  const car = [...room.state.vehicles.values()][0];
  room.systems.vehicles.toggle('p1');
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);

  const attacker = room.systems.world.spawnZombie('normal', { x: car.x + 90, y: car.y });
  const before = car.health;
  step(room, 40);
  check(
    'Zombies gehen auf die Hülle los',
    car.health < before,
    `(${Math.round(before - car.health)} Schaden)`,
  );
  check(
    'Und stehen dabei nicht im Fahrzeug',
    !room.systems.world.state.vehicles.has(car.id) ||
      Math.hypot(attacker.x - car.x, attacker.y - car.y) > VEHICLES.car.height / 2,
  );
}
{
  // Das Räumschild schützt nur vorne; Seiten und Heck bleiben die Schwachstelle.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', {
    type: 'bulldozer',
    x: 1280,
    y: 800,
    rotation: 0,
  });
  const bulldozer = [...room.state.vehicles.values()][0];
  const full = bulldozer.health;
  room.systems.world.hullMelee(bulldozer, 100, bulldozer.x + 100, bulldozer.y);
  const frontDamage = full - bulldozer.health;
  const beforeRear = bulldozer.health;
  room.systems.world.hullMelee(bulldozer, 100, bulldozer.x - 100, bulldozer.y);
  const rearDamage = beforeRear - bulldozer.health;
  check(
    'Planierraupe ist an Seiten und Heck verwundbarer als vorne',
    rearDamage > frontDamage * 1.5,
    `(${Math.round(frontDamage)} vorne, ${Math.round(rearDamage)} hinten)`,
  );
}

console.log('\n== Neue Fahrzeugmechaniken ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'explosive', x: 1260, y: 800, rotation: 0 });
  const car = [...room.state.vehicles.values()][0];
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  const victim = room.systems.world.spawnZombie('normal', { x: car.x + 80, y: car.y });
  victim.health = victim.maxHealth = 100000;
  room.systems.world.damageVehicle(car, 1e9);
  check(
    'Sprengwagen vernichtet beim Totalschaden Gegner im Umkreis',
    !room.state.vehicles.has(car.id) && victim.health < victim.maxHealth,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 220;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'ricochet', x: 280, y: 800, rotation: 0 });
  const car = [...room.state.vehicles.values()][0];
  room.systems.vehicles.toggle('p1');
  car.x = 64;
  car.vx = -300;
  car.vy = 0;
  room.systems.vehicles.update(0.05, false);
  check('Turbo-Abpraller federt von der Kartengrenze zurück', car.vx > 0, `(${car.vx.toFixed(0)})`);
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeVehicle('p1', { type: 'jumper', x: 1260, y: 800, rotation: 0 });
  const car = [...room.state.vehicles.values()][0];
  room.systems.vehicles.toggle('p1');
  runtime.input = { ...IDLE, right: true, dash: true, aimX: 1600, aimY: 800 };
  room.update(50);
  check(
    'Sprungfahrzeug gewinnt per Dash enorm viel Geschwindigkeit',
    car.boost > 0 && Math.hypot(car.vx, car.vy) > VEHICLES.jumper.speed,
    `(${Math.hypot(car.vx, car.vy).toFixed(0)} Tempo)`,
  );
}

console.log('\n== Endlos-Skalierung ==');
{
  check('Bis Welle 30 bleibt die bekannte Balance', endlessHealthScale(30, 2) === 1);
  check(
    'Zwei Spieler erhöhen nach Welle 30 den Gegnerdruck',
    endlessHealthScale(45, 2) > endlessHealthScale(45, 1),
  );
  check(
    'Späte Gegner skalieren bei Leben, Schaden und Tempo weiter',
    endlessHealthScale(60, 2) > endlessHealthScale(40, 2) &&
      endlessDamageScale(60) > endlessDamageScale(40) &&
      endlessSpeedScale(60) > endlessSpeedScale(40),
  );
  check(
    'Welle 50 zahlt deutlich mehr permanentes Gold',
    endlessRunReward(MAPS[0], 50) === 1415 &&
      endlessRunReward(MAPS[0], 50) > endlessRunReward(MAPS[0], 30) * 2,
    `(${endlessRunReward(MAPS[0], 50)} Gold)`,
  );

  const room = makeRoom('outpost', { endless: true });
  join(room, 'p1');
  join(room, 'p2');
  room.state.wave = 30;
  const wave30 = room.systems.world.spawnZombie('normal', { x: 1200, y: 800 });
  room.state.wave = 50;
  const wave50 = room.systems.world.spawnZombie('normal', { x: 1300, y: 800 });
  check(
    'Die Serverwerte wenden die neue Kurve wirklich an',
    wave50.maxHealth > wave30.maxHealth * 3 && wave50.damage > wave30.damage * 1.5,
    `(Leben ${wave30.maxHealth} -> ${wave50.maxHealth}, Schaden ${wave30.damage.toFixed(1)} -> ${wave50.damage.toFixed(1)})`,
  );
}

console.log('\n== Bauen, Reparieren, Verkaufen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;

  const wood = DEFENSES.wood;
  room.systems.build.placeDefense('p1', { type: 'wood', x: 1200, y: 1050, rotation: 0 });
  room.systems.build.placeDefense('p1', {
    type: 'wood',
    x: 1200 + wood.width,
    y: 1050,
    rotation: 0,
  });
  check('Barrikaden stehen lückenlos nebeneinander', room.state.defenses.size === 2);

  const [movable] = [...room.state.defenses.values()];
  const others = [...room.state.defenses.values()].filter((entry) => entry.id !== movable.id);
  let farSpot;
  for (let y = 100; y < ARENA.height - 100 && !farSpot; y += 100) {
    for (let x = 100; x < ARENA.width - 100; x += 100) {
      const candidate = { type: movable.type, x, y, rotation: 0 };
      if (
        Math.hypot(x - movable.x, y - movable.y) > PLACE_RANGE * 2 &&
        canPlaceDefense(candidate, others, room.systems.world.map.obstacles)
      ) {
        farSpot = candidate;
        break;
      }
    }
  }
  room.systems.build.beginMove('p1', movable.id);
  player.x = 200;
  player.y = 200;
  room.systems.build.movePlaced('p1', { id: movable.id, ...farSpot });
  check(
    'Ausgewählte Türme und Barrikaden lassen sich über die ganze Karte verschieben',
    Boolean(farSpot) && movable.x === farSpot.x && movable.y === farSpot.y,
  );

  player.x = 1200;
  player.y = 1150;
  room.systems.build.placeDefense('p1', {
    type: 'wood',
    x: 1200 + wood.width - 8,
    y: 1050,
    rotation: 0,
  });
  check('Überlappende Barrikade wird abgelehnt', room.state.defenses.size === 2);

  const [first] = [...room.state.defenses.values()];
  first.health = first.maxHealth - 200;
  player.money = 500;
  player.x = first.x;
  player.y = first.y + 30;
  room.systems.build.repairDefense('p1', first.id);
  check(
    'Reparieren füllt auf und kostet den angezeigten Preis',
    first.health === first.maxHealth && player.money === 500 - Math.ceil(200 * REPAIR_COST_PER_HP),
    `(${first.health}/${first.maxHealth}, ${player.money} $)`,
  );

  const beforeSell = player.money;
  room.systems.build.sellDefense('p1', first.id);
  check(
    'Frisch gebaut zahlt den vollen Preis zurück',
    room.state.defenses.size === 1 && player.money === beforeSell + wood.cost,
    `(${player.money} $)`,
  );

  const [remaining] = [...room.state.defenses.values()];
  player.x = 400;
  player.y = 400;
  const moneyOutOfReach = player.money;
  room.systems.build.sellDefense('p1', remaining.id);
  room.systems.build.repairDefense('p1', remaining.id);
  check(
    'Außer Reichweite passiert nichts',
    room.state.defenses.size === 1 && player.money === moneyOutOfReach,
  );

  // Eine neue Welle senkt den Wert nicht mehr pauschal.
  room.systems.waves.startNextWave();
  check('Nach dem Wellenstart bleibt der Originalpreis', remaining.refund === wood.cost);
  room.systems.waves.finishWave();
  remaining.health = remaining.maxHealth / 2;
  const damagedRefund = sellValue('wood', remaining.health, remaining.maxHealth);
  player.x = remaining.x;
  player.y = remaining.y + 40;
  const beforeUsedSell = player.money;
  room.systems.build.sellDefense('p1', remaining.id);
  check(
    'Nur tatsächlicher Schaden senkt den Verkaufspreis',
    room.state.defenses.size === 0 && player.money === beforeUsedSell + damagedRefund,
    `(${player.money - beforeUsedSell} $)`,
  );
}

console.log('\n== Neue Barrikaden ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;
  room.systems.build.placeDefense('p1', {
    type: 'blastwall',
    x: 1200,
    y: 1050,
    rotation: 0,
  });
  const wall = [...room.state.defenses.values()][0];
  const zombie = room.systems.world.spawnZombie('normal', { x: 1220, y: 1050 });
  zombie.health = 1000;
  zombie.maxHealth = 1000;
  const before = zombie.health;
  room.systems.world.damageStructures(wall.x, wall.y, 12, wall.maxHealth + 1);
  check('Sprengwand verschwindet beim Zerbrechen', room.state.defenses.size === 0);
  check(
    'Sprengwand trifft die Horde bei ihrer Detonation',
    zombie.health < before,
    `(${Math.round(before - zombie.health)} Schaden)`,
  );

  room.state.zombies.clear();
  room.systems.build.placeDefense('p1', {
    type: 'wire',
    x: 1200,
    y: 1050,
    rotation: 0,
  });
  const wire = [...room.state.defenses.values()][0];
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  makeInvincible(player);
  const runner = room.systems.world.spawnZombie('normal', { x: 1200, y: 960 });
  runner.health = 1000;
  runner.maxHealth = 1000;
  const wireHealth = wire.health;
  step(room, 75);
  check(
    'Stacheldraht ist eine durchquerbare Bodenfalle',
    runner.y > wire.y + DEFENSES.wire.height / 2 + runner.radius,
    `(Zombie bei y=${Math.round(runner.y)})`,
  );
  check(
    'Die Bodenfalle verletzt Zombies beim Durchlaufen',
    runner.health < runner.maxHealth,
    `(${Math.round(runner.maxHealth - runner.health)} Schaden)`,
  );
  check(
    'Die Horde verschleißt den Stacheldraht',
    wire.health < wireHealth,
    `(${Math.round(wireHealth - wire.health)} Haltbarkeit)`,
  );

  room.state.zombies.clear();
  for (let index = 0; index < 16; index += 1) {
    const trampler = room.systems.world.spawnZombie('normal', {
      x: wire.x + ((index % 4) - 1.5) * 6,
      y: wire.y + (Math.floor(index / 4) - 1.5) * 4,
    });
    trampler.health = 1000;
    trampler.maxHealth = 1000;
  }
  step(room, 25);
  check(
    'Eine dichte Horde zertrampelt den Stacheldraht schnell',
    !room.state.defenses.has(wire.id),
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;
  room.systems.build.placeDefense('p1', {
    type: 'mine',
    x: 1200,
    y: 1050,
    rotation: 0,
  });
  const mine = [...room.state.defenses.values()][0];
  room.systems.waves.startNextWave();
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  const victim = room.systems.world.spawnZombie('big', { x: mine.x, y: mine.y });
  const before = victim.health;
  room.update(50);
  check('Kontaktmine verschwindet beim ersten Feindkontakt', !room.state.defenses.has(mine.id));
  check(
    'Kontaktmine verursacht sofort hohen Explosionsschaden',
    !room.state.zombies.has(victim.id) || victim.health < before - 200,
    `(${Math.round(before - victim.health)} Schaden)`,
  );
}

console.log('\n== Freie Ecken und sichere Zombie-Einstiege ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 100;
  player.y = 100;
  room.systems.build.placeDefense('p1', { type: 'wood', x: 60, y: 60, rotation: 0 });
  const cornerDefense = [...room.state.defenses.values()][0];
  check('Verteidigung lässt sich direkt in der Ecke bauen', Boolean(cornerDefense));

  const radius = ZOMBIES.normal.radius;
  const spawns = Array.from({ length: 160 }, () => room.systems.world.edgeSpawn(radius));
  check(
    'Zombies betreten die Karte von außerhalb',
    spawns.every(
      (spawn) => spawn.x < 0 || spawn.x > ARENA.width || spawn.y < 0 || spawn.y > ARENA.height,
    ),
  );
  check(
    'Kein Zombie-Einstieg liegt in der Eckverteidigung',
    !cornerDefense ||
      spawns.every((spawn) => {
        const entryX = Math.max(12, Math.min(ARENA.width - 12, spawn.x));
        const entryY = Math.max(12, Math.min(ARENA.height - 12, spawn.y));
        return !room.systems.world.circleOverlapsDefense(
          entryX,
          entryY,
          radius + 18,
          cornerDefense,
        );
      }),
  );
  check(
    'Zombie-Einstiege halten Abstand zum Spieler',
    spawns.every((spawn) => {
      const entryX = Math.max(12, Math.min(ARENA.width - 12, spawn.x));
      const entryY = Math.max(12, Math.min(ARENA.height - 12, spawn.y));
      return Math.hypot(player.x - entryX, player.y - entryY) >= radius + 198;
    }),
  );
}

console.log('\n== Besondere Vorteile ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', {
    perks: { starterWeapon: true, starterBarricade: true, starterTurret: true, engineer: true },
  });
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;

  const beforeWeapon = player.money;
  room.systems.build.buyWeapon('p1', 'smg');
  const paid = beforeWeapon - player.money;
  check(
    'Erste Waffe ist genau 20 % günstiger',
    paid === Math.round(WEAPONS.smg.cost * (1 - STARTER_DISCOUNT)),
    `(${paid} statt ${WEAPONS.smg.cost})`,
  );
  const beforeSecond = player.money;
  room.systems.build.buyWeapon('p1', 'rifle');
  check(
    'Zweite Waffe kostet wieder voll',
    beforeSecond - player.money === WEAPONS.rifle.cost,
    `(${beforeSecond - player.money})`,
  );
  const beforeDiscountSale = player.money;
  room.systems.build.sellWeapon('p1', 'smg');
  check(
    'Rabattwaffe zahlt beim Verkauf den ursprünglichen Listenpreis zurück',
    player.money === beforeDiscountSale + WEAPONS.smg.cost,
    `(+${player.money - beforeDiscountSale} statt +${WEAPONS.smg.cost})`,
  );

  const wallCosts = [];
  for (let index = 0; index < STARTER_BARRICADE_COUNT + 1; index += 1) {
    const beforeWall = player.money;
    room.systems.build.placeDefense('p1', {
      type: 'wood',
      x: 1200 + DEFENSES.wood.width * index,
      y: 1050,
      rotation: 0,
    });
    wallCosts.push(beforeWall - player.money);
  }
  check(
    'Nur die ersten zwei Barrikaden sind genau 20 % günstiger',
    wallCosts
      .slice(0, STARTER_BARRICADE_COUNT)
      .every((cost) => cost === Math.round(DEFENSES.wood.cost * (1 - STARTER_DISCOUNT))) &&
      wallCosts[STARTER_BARRICADE_COUNT] === DEFENSES.wood.cost,
    `(${wallCosts.join(', ')})`,
  );

  const beforeTurret = player.money;
  room.systems.build.placeDefense('p1', { type: 'mg', x: 1330, y: 1150, rotation: 0 });
  check(
    'Erster Turm ist genau 20 % günstiger',
    beforeTurret - player.money === Math.round(DEFENSES.mg.cost * (1 - STARTER_DISCOUNT)),
    `(${beforeTurret - player.money})`,
  );

  const [wall] = [...room.state.defenses.values()];
  wall.health = wall.maxHealth - 200;
  player.x = wall.x;
  player.y = wall.y + 30;
  const beforeRepair = player.money;
  room.systems.build.repairDefense('p1', wall.id);
  check(
    'Techniker repariert günstiger',
    beforeRepair - player.money < Math.ceil(200 * REPAIR_COST_PER_HP),
    `(${beforeRepair - player.money})`,
  );
}

console.log('\n== Dash ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', { upgrades: { dashCharges: 2 } });
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();

  check('Vier Ladungen mit zwei Stufen', player.dashMax === 4, `(${player.dashMax})`);
  const startX = player.x;
  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 200, aimY: player.y };
  room.update(50);
  check('Dash verbraucht eine Ladung', player.dashCharges === 3, `(${player.dashCharges})`);
  check('Dash läuft', player.dashing > 0);

  player.maxHealth = 1000;
  player.health = 1000;
  const healthBefore = player.health;
  room.systems.world.damagePlayer(player, 100);
  const through = healthBefore - player.health;
  check(
    `Dash schluckt ohne Stufe ${Math.round(DASH_BASE_RESIST * 100)} % des Schadens`,
    Math.abs(through - 100 * (1 - DASH_BASE_RESIST)) < 0.01,
    `(${through} statt ${100 * (1 - DASH_BASE_RESIST)})`,
  );

  runtime.input = { ...IDLE, right: true, aimX: player.x + 200, aimY: player.y };
  step(room, Math.ceil((DASH_SECONDS * 1000) / 50) + 2);
  check('Dash endet von selbst', player.dashing === 0);
  check('Dash bringt Strecke', player.x - startX > 60, `(${Math.round(player.x - startX)} px)`);

  const beforeFull = player.health;
  room.systems.world.damagePlayer(player, 100);
  check(
    'Nach dem Dash trifft der volle Schaden',
    Math.abs(beforeFull - player.health - 100) < 0.01,
    `(${beforeFull - player.health})`,
  );

  step(room, 100);
  check('Ladung lädt nach', player.dashCharges === 4, `(${player.dashCharges})`);
}
{
  // Voll ausgebaut ist der Dash wieder das alte Ausweichmanöver.
  const room = makeRoom('outpost');
  const maxResist = upgradeMaxLevel('dashResist');
  const player = join(room, 'p1', { upgrades: { dashResist: maxResist } });
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();

  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 200, aimY: player.y };
  room.update(50);
  const before = player.health;
  const landed = room.systems.world.damagePlayer(player, 5000);
  check(
    `Volle Stufe (${maxResist}) macht den Dash unverwundbar`,
    player.dashing > 0 && player.health === before && landed === false,
    `(${player.health}/${before})`,
  );
  check('Mehr als voll geht nicht', dashReduction(maxResist + 5) === 1);
  check(
    'Jede Stufe bringt deutlich mehr als ein Prozent-Upgrade',
    dashReduction(1) - dashReduction(0) >= 0.05,
    `(${((dashReduction(1) - dashReduction(0)) * 100).toFixed(0)} %)`,
  );
}

console.log('\n== Stoßdash ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', { perks: { dashShock: true } });
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  makeInvincible(player);

  const target = room.systems.world.spawnZombie('big', { x: player.x + 150, y: player.y });
  target.health = 1e6;
  target.maxHealth = 1e6;
  target.speed = 0;
  target.baseSpeed = 0;
  const beforeX = target.x;
  const beforeHealth = target.health;

  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 300, aimY: player.y };
  room.update(50);
  runtime.input = { ...IDLE, right: true, aimX: player.x + 300, aimY: player.y };
  step(room, 4);

  check('Stoßdash trifft über die ganze Dash-Strecke', target.health < beforeHealth);
  check(
    'Stoßdash schleudert den Gegner deutlich nach vorne',
    target.x - beforeX > 70,
    `(${Math.round(target.x - beforeX)} px)`,
  );
}

console.log('\n== Klingendash und Schild ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', { perks: { dashBlades: true }, upgrades: { dashShield: 50 } });
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  makeInvincible(player);

  // Zwei Gegner direkt in der Dash-Spur, der zweite weit genug weg, dass ihn
  // nur die geprüfte Strecke erwischt.
  const near = room.systems.world.spawnZombie('normal', { x: player.x + 45, y: player.y });
  const far = room.systems.world.spawnZombie('normal', { x: player.x + 120, y: player.y });
  near.health = 1e6;
  far.health = 1e6;
  const nearBefore = near.health;
  const farBefore = far.health;

  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 200, aimY: player.y };
  room.update(50);
  runtime.input = { ...IDLE, right: true, aimX: player.x + 200, aimY: player.y };
  step(room, 4);

  check('Dash schneidet den Gegner davor', near.health < nearBefore, `(${near.health})`);
  check('Auch der weiter entfernte in der Spur wird getroffen', far.health < farBefore);
  check('Jeder Gegner gibt Schild', player.shield > 0, `(${Math.round(player.shield)})`);
  check(
    'Die Stufe erhöht den Schild pro Gegner',
    player.shield > 2 * 10,
    `(${Math.round(player.shield)} statt 20)`,
  );

  // Das Schild fängt den Treffer ab, bevor er das Leben erreicht.
  player.dashing = 0;
  player.health = 500;
  player.maxHealth = 500;
  player.shield = 40;
  room.systems.world.damagePlayer(player, 30);
  check(
    'Schild schluckt den Treffer',
    player.health === 500 && Math.round(player.shield) === 10,
    `(${player.health} HP, ${Math.round(player.shield)} Schild)`,
  );
  room.systems.world.damagePlayer(player, 30);
  check(
    'Nur der Rest geht ans Leben',
    player.shield === 0 && player.health === 480,
    `(${player.health} HP, ${player.shield} Schild)`,
  );

  // Ohne Gegner rührt nichts das Schild an, es muss von selbst leerlaufen.
  room.state.zombies.clear();
  player.shield = 40;
  step(room, 220);
  check('Schild schmilzt von selbst weg', player.shield === 0, `(${player.shield})`);
  check(
    'Schild bleibt ein Teil des eigenen Lebens',
    player.shieldMax === Math.round(500 * 0.35),
    `(${player.shieldMax})`,
  );
}
{
  // Ohne den Vorteil bleibt der Dash ein reines Ausweichmanöver.
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  makeInvincible(player);

  const target = room.systems.world.spawnZombie('normal', { x: player.x + 45, y: player.y });
  target.health = 1e6;
  const before = target.health;
  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 200, aimY: player.y };
  room.update(50);
  step(room, 4);
  check('Ohne Klingendash kein Schaden', target.health === before);
  check('Ohne Klingendash kein Schild', player.shield === 0);
}

console.log('\n== Frostkanone bremst ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  makeInvincible(player);
  player.x = 700;
  player.y = 800;
  player.weapon = 'cryo';
  player.fireCooldown = 0;

  const zombie = room.systems.world.spawnZombie('normal', { x: 900, y: 800 });
  zombie.health = 1e6;
  zombie.maxHealth = 1e6;
  const walking = zombie.baseSpeed;
  for (let tick = 0; tick < 12; tick += 1) {
    zombie.x = 900;
    zombie.y = 800;
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    runtime.input = { ...IDLE, shoot: true, aimX: zombie.x, aimY: zombie.y };
    room.update(50);
  }
  check('Frost hält an', zombie.chilled > 0, `(${zombie.chilled.toFixed(1)} s)`);
  check(
    `Gegner läuft langsamer (${Math.round(zombie.speed)} statt ${Math.round(walking)})`,
    zombie.speed < walking * 0.75,
  );
  check('Frost macht trotzdem Schaden', zombie.health < 1e6);

  // Der Frost taut wieder auf, sonst stünde die Horde für immer still.
  runtime.input = { ...IDLE };
  step(room, Math.ceil((WEAPONS.cryo.slowSeconds * 1000) / 50) + 4);
  check(
    'Frost taut wieder auf',
    zombie.chilled === 0 && zombie.speed >= walking,
    `(${zombie.speed})`,
  );

  // Stacheldraht bremst schwächer, darf den stärkeren Frost nicht aufheben.
  room.systems.world.chillZombie(zombie, 0.5, 2);
  room.systems.world.chillZombie(zombie, 0.25, 2);
  check('Der stärkere Frost bleibt', zombie.slowFactor === 0.5, `(${zombie.slowFactor})`);
}

console.log('\n== Treffer im Dash klingt anders ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', { upgrades: { dashResist: upgradeMaxLevel('dashResist') } });
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();

  const world = room.systems.world;
  const seen = [];
  const pushFx = world.pushFx.bind(world);
  world.pushFx = (event) => {
    seen.push(event);
    pushFx(event);
  };

  const zombie = world.spawnZombie('normal', { x: player.x, y: player.y });
  zombie.attackCooldown = 0;
  // Dash-Fenster ohne Bewegung, damit der Zombie in Reichweite bleibt.
  player.dashing = 1;
  const healthBefore = player.health;
  room.update(50);
  check('Voll ausgebauter Dash schluckt den Schlag', player.health === healthBefore);
  check(
    'Abgewehrter Treffer meldet sich eigen',
    seen.some((event) => event.k === 'deflect') && !seen.some((event) => event.k === 'blood'),
    `(${seen.map((event) => event.k).join(', ')})`,
  );

  // Ohne die Stufe ist der Dash keine Wand: der Rest kommt durch und blutet.
  seen.length = 0;
  runtime.upgrades.dashResist = 0;
  zombie.attackCooldown = 0;
  zombie.x = player.x;
  zombie.y = player.y;
  const partialBefore = player.health;
  room.update(50);
  check(
    'Ohne Stufe kommt ein Teil durch',
    player.health < partialBefore && player.health > partialBefore - zombie.damage,
    `(${(partialBefore - player.health).toFixed(1)} von ${zombie.damage.toFixed(1)})`,
  );
  check(
    'Der Rest zählt als Treffer',
    seen.some((event) => event.k === 'blood') && !seen.some((event) => event.k === 'deflect'),
    `(${seen.map((event) => event.k).join(', ')})`,
  );

  seen.length = 0;
  player.dashing = 0;
  zombie.attackCooldown = 0;
  zombie.x = player.x;
  zombie.y = player.y;
  room.update(50);
  check('Ohne Dash fließt wieder Blut', player.health < healthBefore);
  check(
    'Echter Treffer bleibt beim Blut-Effekt',
    seen.some((event) => event.k === 'blood') && !seen.some((event) => event.k === 'deflect'),
    `(${seen.map((event) => event.k).join(', ')})`,
  );
}

console.log('\n== Geld wird gleich geteilt ==');
{
  const room = makeRoom('outpost');
  const shooter = join(room, 'p1');
  const helper = join(room, 'p2');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  shooter.money = 0;
  helper.money = 0;

  const [id, zombie] = (() => {
    const created = room.systems.world.spawnZombie('normal', { x: 1200, y: 800 });
    let key = '';
    room.state.zombies.forEach((candidate, candidateId) => {
      if (candidate === created) key = candidateId;
    });
    return [key, created];
  })();
  // p1 macht den ganzen Schaden, p2 steht nur daneben.
  room.systems.world.damageZombie(id, zombie, 1e6, 'p1');

  check(
    'Beide bekommen genau denselben Anteil',
    shooter.money === helper.money && helper.money > 0,
    `(${shooter.money} $ / ${helper.money} $)`,
  );
  check(
    'Zusammen ergibt es die volle Prämie',
    Math.abs(shooter.money + helper.money - ZOMBIES.normal.reward) <= 2,
    `(${shooter.money} + ${helper.money} statt ${ZOMBIES.normal.reward})`,
  );
  check('Der Abschuss zählt für den Schützen', shooter.kills === 1 && helper.kills === 0);
}

console.log('\n== Upgrades aus der Lobby ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  check('Ohne Upgrades das Grundleben', player.maxHealth === 100, `(${player.maxHealth})`);

  room.applyLoadout('p1', {
    upgrades: { startMoney: 3, maxHealth: 10, dashCharges: 2 },
    perks: { extraGrenade: true },
  });
  check(
    'Kauf in der Lobby zählt sofort',
    player.maxHealth === 120 && player.health === 120 && player.dashMax === 4,
    `(${player.maxHealth} HP, ${player.dashMax} Dashes)`,
  );
  check(
    'Der Granatenvorteil kommt mit',
    player.abilityMax === 4 && player.abilityCharges === 4,
    `(${player.abilityCharges}/${player.abilityMax})`,
  );
  check('Startkapital steigt pro Stufe', player.money === startingMoney(3), `($ ${player.money})`);

  startCombat(room);
  check(
    'Der Run übernimmt die Werte',
    player.maxHealth === 120 && player.dashMax === 4 && player.money === startingMoney(3),
  );
  room.applyLoadout('p1', { upgrades: { maxHealth: 40 }, perks: {} });
  check('Mitten im Run zählt kein Nachkauf', player.maxHealth === 120, `(${player.maxHealth})`);
}

console.log('\n== Lebensregeneration ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', { upgrades: { healthRegen: 10 } });
  startCombat(room);
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  player.health = 50;
  const expected = 50 + healthRegenPerSecond(10) * 4;
  room.systems.players.update(4);
  check(
    'Stufen regenerieren im Kampf Leben pro Sekunde',
    player.health === expected,
    `(${player.health} statt ${expected})`,
  );
  player.health = player.maxHealth - 1;
  room.systems.players.update(4);
  check('Regeneration stoppt bei maximalem Leben', player.health === player.maxHealth);
}

console.log('\n== Wellenende heilt den Trupp ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  player.health = 1;
  player.alive = false;
  player.reviveProgress = 0.4;
  room.systems.waves.finishWave();
  check(
    'Am Wellenende voll geheilt und wieder auf den Beinen',
    player.alive && player.health === player.maxHealth && player.reviveProgress === 0,
    `(${player.health}/${player.maxHealth}, alive=${player.alive})`,
  );
  check('Keine Bauzeit-Uhr mehr', room.state.nextWaveIn === undefined);

  const before = room.state.wave;
  room.update(50);
  room.update(50);
  check(
    'Bauphase läuft nicht von selbst ab',
    room.state.phase === 'build' && room.state.wave === before,
  );
  player.ready = true;
  if (room.systems.world.everyoneReady()) room.systems.waves.startNextWave();
  check(
    'Bereit startet die nächste Welle',
    room.state.phase === 'combat' && room.state.wave === before + 1,
  );
}

console.log('\n== Host-Start und sichere neue Tabs ==');
{
  const room = makeRoom('outpost');
  const host = join(room, 'host');
  const guest = join(room, 'guest');
  check(
    'Nur der Host kann den Run starten',
    room.requestStart('guest') === false &&
      room.state.phase === 'lobby' &&
      room.requestStart('host') === true &&
      room.state.phase === 'build' &&
      room.state.wave === 0 &&
      room.requestStart('host') === true &&
      room.state.phase === 'combat',
  );
  room.systems.waves.finishWave();
  const wave = room.state.wave;
  host.ready = false;
  guest.ready = false;
  check(
    'Ein Mitspieler kann die Bereitschaft nicht übergehen',
    room.requestStart('guest') === false && room.state.phase === 'build',
  );
  check(
    'Der Host kann die nächste Welle ohne alle Stimmen erzwingen',
    room.requestStart('host') === true &&
      room.state.phase === 'combat' &&
      room.state.wave === wave + 1,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  join(room, 'anchor');
  room.requestStart('p1');
  room.requestStart('p1');
  room.systems.waves.finishWave();
  player.x = 1200;
  player.y = 800;
  room.systems.build.placeDefense('p1', {
    type: 'wood',
    x: 1260,
    y: 800,
    rotation: 0,
  });
  const buildings = room.state.defenses.size;
  room.onLeave({ sessionId: 'p1' });
  const returned = join(room, 'p1-return', { upgrades: { startMoney: 40 } });
  check('Gebautes bleibt stehen, wenn ein Spieler geht', room.state.defenses.size === buildings);
  check(
    'Eine neue Session in einem laufenden Run gibt kein neues Anfangsgeld',
    returned.money === 0,
    `($ ${returned.money})`,
  );
}

console.log('\n== Endlosmodus ==');
{
  const map = MAPS[0];
  const room = makeRoom(map.id, { endless: true });
  const player = join(room, 'p1');
  let reward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') reward = payload;
  };
  check(
    'Endlos kennt kein Wellenziel',
    room.state.endless === true && room.state.totalWaves === 0,
    `(${room.state.totalWaves})`,
  );

  startCombat(room);
  makeInvincible(player);
  // Direkt vor die letzte geplante Welle setzen, statt alle zu spielen.
  room.state.wave = map.waves.length;
  room.state.zombies.clear();
  room.systems.waves.spawnQueue = [];
  room.systems.waves.finishWave();
  check(
    'Nach der letzten geplanten Welle geht es weiter',
    room.state.phase === 'build' && reward === null,
    `(${room.state.phase})`,
  );

  room.systems.waves.startNextWave();
  check(
    'Die erzeugte Welle läuft',
    room.state.phase === 'combat' && room.state.wave === map.waves.length + 1,
    `(Welle ${room.state.wave})`,
  );
  check(
    'Sie schickt auch Gegner',
    room.systems.waves.spawnQueue.length > 0,
    `(${room.systems.waves.spawnQueue.length} in der Warteschlange)`,
  );
  check(
    'Der Status sagt Endlos',
    room.state.statusText.includes('Endlos'),
    `(${room.state.statusText})`,
  );

  // Ein Endlos-Run schaltet nichts frei, egal wie weit er kommt.
  player.health = 0;
  player.alive = false;
  room.systems.waves.checkDefeat();
  check(
    'Endlos zählt nie als Sieg',
    reward !== null && reward.victory === false,
    `(${reward && reward.victory})`,
  );
  check(
    'Der Lohn richtet sich nach der erreichten Welle',
    reward !== null && reward.gold > 0 && reward.wave === map.waves.length + 1,
    `(${reward && reward.gold} Gold, Welle ${reward && reward.wave})`,
  );
}
{
  // Dieselbe Karte ohne Endlos endet weiterhin mit dem Sieg.
  const map = MAPS[0];
  const room = makeRoom(map.id);
  const player = join(room, 'p1');
  let reward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') reward = payload;
  };
  startCombat(room);
  makeInvincible(player);
  room.state.wave = map.waves.length;
  room.state.zombies.clear();
  room.systems.waves.spawnQueue = [];
  room.systems.waves.finishWave();
  check(
    'Die Kampagne endet mit dem Sieg',
    room.state.phase === 'gameover' && reward !== null && reward.victory === true,
    `(${room.state.phase})`,
  );
  check('Und zählt die Wellen der Karte', room.state.totalWaves === map.waves.length);
  const confirmed = room.systems.waves.currentReward(true);
  check(
    'Die Exit-Bestätigung wiederholt denselben Run-Lohn sicher',
    confirmed !== undefined &&
      confirmed.runId === reward.runId &&
      confirmed.gold === reward.gold &&
      room.state.players.get('p1') === player,
  );
}

console.log('\n== Freiwilliger Run-Ausstieg ==');
{
  const map = MAPS[0];
  const room = makeRoom(map.id);
  const player = join(room, 'p1');
  const teammate = join(room, 'p2');
  startCombat(room);
  room.state.wave = 7;
  const reward = room.systems.waves.currentReward(false);
  check(
    'Verlassen ohne Tod zahlt den erreichten Kampagnenfortschritt',
    reward !== undefined &&
      reward.gold === campaignRunReward(map, 7, false) &&
      reward.runId === room.state.runId,
    `(${reward && reward.gold} Gold)`,
  );
  check(
    'Die Abrechnung verändert den Run des Mitspielers nicht',
    room.state.phase === 'combat' &&
      room.state.players.get('p1') === player &&
      room.state.players.get('p2') === teammate,
  );
  check(
    'Nur der Host darf den gemeinsamen Run aufgeben',
    room.requestAbandon('p2') === false && room.state.phase === 'combat',
  );
  let squadReward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') squadReward = payload;
  };
  check('Der Host kann den Run aufgeben', room.requestAbandon('p1') === true);
  check(
    'Aufgeben zahlt den Fortschritt und öffnet die gemeinsame Lobby',
    squadReward?.gold === campaignRunReward(map, 7, false) &&
      room.state.phase === 'lobby' &&
      room.state.runId === '' &&
      room.state.zombies.size === 0,
  );
}

console.log('\n== Kampagnenlohn bei Niederlage ==');
{
  const map = MAPS[MAPS.length - 1];
  const room = makeRoom(map.id);
  const player = join(room, 'p1');
  let reward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') reward = payload;
  };
  startCombat(room);
  room.state.wave = map.waves.length - 1;
  player.health = 0;
  player.alive = false;
  room.systems.waves.checkDefeat();

  check(
    'Eine späte Niederlage zahlt den verdoppelten Fortschrittsbonus',
    reward !== null &&
      reward.gold === campaignRunReward(map, map.waves.length - 1, false) &&
      reward.gold > map.reward / 2,
    `(${reward && reward.gold} Gold)`,
  );
  check(
    'Der Sieg bleibt mehr wert',
    reward !== null && reward.gold < campaignRunReward(map, map.waves.length, true),
    `(${reward && reward.gold} Gold)`,
  );
}

console.log('\n== Arsenal ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.finishWave();
  player.money = 1e6;

  room.systems.build.buyWeapon('p1', 'smg');
  room.systems.build.buyWeapon('p1', 'rifle');
  check(
    'Gekaufte Waffen bleiben im Arsenal',
    [...player.owned].join() === 'pistol,smg,rifle',
    `(${[...player.owned].join()})`,
  );
  check('Zuletzt gekaufte Waffe ist in der Hand', player.weapon === 'rifle');

  const runtime = room.systems.world.runtime.get('p1');
  player.ammo = 5;
  player.reserveAmmo = 10;
  runtime.input = { ...IDLE, reload: true };
  room.update(50);
  check('Nachladen startet auch in der Bauphase', player.reloading > 0);
  runtime.input = { ...IDLE };
  step(room, 40);
  check(
    'Nachladen wird in der Bauphase abgeschlossen',
    player.ammo === 15 && player.reserveAmmo === 0,
    `(${player.ammo} / ${player.reserveAmmo})`,
  );

  player.ammo = 7;
  room.systems.build.selectWeapon('p1', 'smg');
  check('Wechsel auf eine besessene Waffe', player.weapon === 'smg');
  room.systems.build.selectWeapon('p1', 'rifle');
  check('Munition bleibt pro Waffe erhalten', player.ammo === 7, `(${player.ammo})`);

  room.systems.build.selectWeapon('p1', 'laser');
  check('Nicht gekaufte Waffe bleibt gesperrt', player.weapon === 'rifle');

  room.systems.build.selectWeapon('p1', 'pistol');
  check('Startwaffe bleibt jederzeit verfügbar', player.weapon === 'pistol');

  const pistolMoney = player.money;
  player.reserveAmmo = 10;
  room.systems.build.buyAmmo('p1');
  check(
    'Unendliche Pistolenmunition kann nicht gekauft werden',
    player.money === pistolMoney && player.reserveAmmo === 10,
  );

  room.systems.build.selectWeapon('p1', 'rifle');
  const money = player.money;
  player.reserveAmmo = reserveCapacity('rifle');
  room.systems.build.buyAmmo('p1');
  check('Kein Munitionskauf bei vollem Vorrat', player.money === money);
  player.reserveAmmo = 10;
  const expectedAmmoCost = ammoRefillCost('rifle', player.reserveAmmo);
  room.systems.build.buyAmmo('p1');
  check(
    'Munitionskauf füllt auf und kostet nur die fehlenden Schüsse',
    player.money === money - expectedAmmoCost && player.reserveAmmo === reserveCapacity('rifle'),
    `(${player.reserveAmmo} Schuss, $ ${money - player.money})`,
  );

  player.ammo = 0;
  player.reserveAmmo = 0;
  const beforeWeaponSale = player.money;
  const expectedWeaponRefund = weaponSellValue(
    'rifle',
    0,
    0,
    0,
    0,
    room.systems.world.map.moneyScale,
  );
  room.systems.build.sellWeapon('p1', 'rifle');
  check(
    'Leere Waffe verkauft sich nur abzüglich fehlender Munition',
    player.money === beforeWeaponSale + expectedWeaponRefund &&
      !player.owned.includes('rifle') &&
      player.weapon === 'pistol',
    `(+${player.money - beforeWeaponSale} $)`,
  );
  const afterWeaponSale = player.money;
  room.systems.build.buyWeapon('p1', 'rifle');
  check(
    'Verkaufen und neu kaufen umgeht keine Munitionskosten',
    player.money === afterWeaponSale - WEAPONS.rifle.cost &&
      player.ammo === magazineCapacity('rifle') &&
      player.reserveAmmo === reserveCapacity('rifle') &&
      player.money < beforeWeaponSale,
    `(${beforeWeaponSale - player.money} $ Kosten)`,
  );
}

console.log('\n== Feuerrate ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  startCombat(room);
  // Ein Eintrag in der Warteschlange hält die Welle offen, die riesige
  // Spawn-Pause sorgt dafür, dass trotzdem kein Gegner auftaucht.
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();
  makeInvincible(player);
  const idle = { ...IDLE, aimX: player.x + 200, aimY: player.y };

  for (const weapon of ['pistol', 'smg', 'lmg', 'flamer', 'laser']) {
    player.weapon = weapon;
    player.fireCooldown = 0;
    runtime.input = { ...idle };
    step(room, 6);
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    const before = player.ammo;
    runtime.input = { ...idle, shoot: true };
    room.update(50);
    const fired = before - player.ammo;
    check(`${WEAPONS[weapon].label}: erster Schuss feuert genau einmal`, fired === 1, `(${fired})`);
    runtime.input = { ...idle };
    room.update(50);
  }

  // Dauerfeuer muss trotzdem die volle Kadenz halten.
  player.weapon = 'smg';
  player.ammo = 9999;
  player.fireCooldown = 0;
  runtime.input = { ...idle, shoot: true };
  const sustainedStart = player.ammo;
  step(room, 20);
  const rate = (sustainedStart - player.ammo) / 1;
  check(
    `Dauerfeuer hält die Kadenz (${rate} statt ${Math.round(1000 / WEAPONS.smg.fireDelay)} Schuss/s)`,
    rate >= 1000 / WEAPONS.smg.fireDelay - 1.5,
  );
}

console.log('\n== Sonderzombies ==');
{
  const room = makeRoom('crater');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  player.weapon = 'laser';
  player.x = 1200;
  player.y = 800;

  const boss = room.systems.world.spawnZombie('butcher', { x: 1500, y: 800 });
  const brute = room.systems.world.spawnZombie('brute', { x: 900, y: 800 });
  const exploder = [...room.state.zombies.entries()].find(([, z]) => z.type === 'exploder');
  room.systems.world.spawnZombie('exploder', { x: 1250, y: 820 });
  check('Boss hat Boss-Leben', boss.maxHealth > 5000);

  step(room, 40);
  room.systems.abilities.updateBossBar();
  check('Boss-Leiste gefüllt', room.state.bossMaxHealth > 0 && room.state.bossName.length > 0);

  const runtime = room.systems.world.runtime.get('p1');
  for (let tick = 0; tick < 240; tick += 1) {
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    runtime.input = { ...IDLE, shoot: true, aimX: boss.x, aimY: boss.y };
    room.update(50);
  }
  check('Boss nimmt Schaden', boss.health < boss.maxHealth);
  check('Mini-Boss stürmt', brute.abilityTimers.length > 0);
  check('Explodierer detoniert', !exploder || !room.state.zombies.has(exploder[0]));

  player.x = 100;
  player.y = 100;
  const distantTarget = { x: 2200, y: 1400 };
  const distantZombie = room.systems.world.spawnZombie('normal', distantTarget);
  const distantHealth = distantZombie.health;
  player.abilityCharges = 3;
  room.systems.players.useAbility('p1', distantTarget);
  check('Granate verbraucht', player.abilityCharges === 2);
  check(
    'Granate explodiert auch am anderen Ende der Karte',
    distantZombie.health < distantHealth,
    `(${distantZombie.health}/${distantHealth} HP)`,
  );
}
{
  const room = makeRoom('outpost');
  join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  const carrier = room.systems.world.spawnZombie('shieldbearer', { x: 1400, y: 800 });
  carrier.rotation = Math.PI;
  carrier.baseSpeed = 0;
  carrier.speed = 0;
  const frontHealth = carrier.health;
  const rocket = room.systems.world.createProjectile('p1', 1180, 800, 0, 999, 1000, 'rocket');
  rocket.pierce = 99;
  rocket.splashRadius = 180;
  rocket.splashDamage = 999;
  room.systems.projectiles.update(0.3);
  check(
    'Frontschild entfernt auch explosive und durchdringende Projektile',
    carrier.health === frontHealth && !room.state.projectiles.has(rocket.id),
  );
  const flank = room.systems.world.createProjectile(
    'p1',
    1400,
    1020,
    -Math.PI / 2,
    120,
    1000,
    'rifle',
  );
  room.systems.projectiles.update(0.3);
  check(
    'Schildträger bleibt von der Seite verwundbar',
    carrier.health < frontHealth && !room.state.projectiles.has(flank.id),
    `(${Math.round(frontHealth - carrier.health)} Schaden)`,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', { upgrades: { grenadeSplit: 4 } });
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  room.systems.world.fxQueue.length = 0;
  player.abilityCharges = 3;
  room.systems.players.useAbility('p1', { x: 1500, y: 900 });
  const warnings = room.systems.world.fxQueue.filter(
    (event) => event.k === 'warning' && event.s === 'grenade-mini',
  );
  let minis = room.systems.world.fxQueue.filter(
    (event) => event.k === 'explosion' && event.s === 'grenade-mini',
  );
  check(
    'Splitter-Upgrade kündigt eine Mini-Granate pro Stufe an',
    warnings.length === 4,
    `(${warnings.length}/4)`,
  );
  check('Mini-Granaten explodieren nicht sofort', minis.length === 0, `(${minis.length})`);
  room.systems.players.update(0.1);
  minis = room.systems.world.fxQueue.filter(
    (event) => event.k === 'explosion' && event.s === 'grenade-mini',
  );
  check('Kurzer Splitter-Zünder läuft sichtbar', minis.length === 0, `(${minis.length})`);
  room.systems.players.update(0.13);
  minis = room.systems.world.fxQueue.filter(
    (event) => event.k === 'explosion' && event.s === 'grenade-mini',
  );
  check(
    'Splitter-Upgrade zündet danach eine Mini-Granate pro Stufe',
    minis.length === 4,
    `(${minis.length}/4)`,
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', {
    ability: 'mortarStrike',
    perks: { mortarNapalm: true, extraMortar: true },
  });
  startCombat(room);
  check('Zusatzkammer hält zwei Mörserschläge bereit', player.abilityCharges === 2);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  room.systems.players.useAbility('p1', { x: player.x + 180, y: player.y });
  room.systems.players.update(1.5);
  const napalm = [...room.state.hazards.values()].find((hazard) => hazard.kind === 'napalm');
  check(
    'Phosphorkern hinterlässt ein sichtbares brennendes Feld',
    Boolean(napalm && napalm.life === 6 && napalm.damage === 90),
  );
}
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', {
    ability: 'precisionShot',
    perks: { precisionReload: true, extraPrecision: true },
  });
  startCombat(room);
  check('Doppelmagazin hält zwei Vernichtungsschüsse bereit', player.abilityCharges === 2);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  const victim = room.systems.world.spawnZombie('normal', { x: player.x + 120, y: player.y });
  room.systems.players.useAbility('p1', { x: victim.x, y: victim.y });
  check('Vernichtungsschuss verbraucht zunächst eine Ladung', player.abilityCharges === 1);
  room.systems.projectiles.update(0.1);
  check(
    'Todesurteil reduziert nach einem tödlichen Treffer den Cooldown stark, aber nicht auf null',
    !room.state.zombies.has(victim.id) &&
      player.abilityCharges === 1 &&
      player.abilityCooldown > 0 &&
      player.abilityCooldown < 11,
  );
}
{
  function precisionDamageAgainst(type) {
    const room = makeRoom('outpost');
    const player = join(room, 'p1', {
      ability: 'precisionShot',
      upgrades: { precisionHealthDamage: 5 },
    });
    startCombat(room);
    room.systems.waves.spawnQueue = [];
    room.state.zombies.clear();
    const victim = room.systems.world.spawnZombie(type, { x: player.x + 120, y: player.y });
    victim.maxHealth = 100000;
    victim.health = victim.maxHealth;
    room.systems.players.useAbility('p1', { x: victim.x, y: victim.y });
    room.systems.projectiles.update(0.1);
    return victim.maxHealth - victim.health;
  }

  const eliteDamage = precisionDamageAgainst('normal');
  const miniDamage = precisionDamageAgainst('stalker');
  const bossDamage = precisionDamageAgainst('butcher');
  check(
    'Zielanalyse verursacht prozentualen Maximalleben-Schaden',
    eliteDamage > 6000,
    `(${Math.round(eliteDamage)})`,
  );
  check(
    'Zielanalyse ist gegen Mini-Bosse schwächer und gegen Bosse am schwächsten',
    eliteDamage > miniDamage && miniDamage > bossDamage && bossDamage > 1850,
    `(${Math.round(eliteDamage)} / ${Math.round(miniDamage)} / ${Math.round(bossDamage)})`,
  );
}

console.log('\n== Boss-Fähigkeiten ==');
{
  // Warnkreis: der Zerreißer kündigt seine Druckwelle an, bevor sie trifft.
  const room = makeRoom('citadel');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  player.x = 1200;
  player.y = 800;
  const render = room.systems.world.spawnZombie('render', { x: 1240, y: 800 });
  render.abilityTimers[0] = 0.01;
  room.update(50);
  const warning = [...room.state.hazards.values()].find((hazard) => hazard.kind === 'warning');
  check('Druckwelle wird mit Warnkreis angekündigt', Boolean(warning));
  check('Warnkreis hat Vorlaufzeit', !warning || warning.life > 0.5, `(${warning?.life})`);
  const healthBefore = player.health;
  step(room, 60);
  check(
    'Warnkreis schlägt danach ein',
    player.health < healthBefore || room.state.hazards.size === 0,
  );
}
{
  // Lavapfützen bleiben liegen und tun weh.
  const room = makeRoom('foundry');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  player.x = 1200;
  player.y = 800;
  player.health = 1e9;
  player.maxHealth = 1e9;
  const slag = room.systems.world.spawnZombie('slag', { x: 1200, y: 800 });
  const puddle = slag.abilityTimers.findIndex(() => true);
  slag.abilityTimers[puddle] = 0.01;
  room.update(50);
  const pool = [...room.state.hazards.values()].find(
    (hazard) => hazard.kind === 'lava' || hazard.kind === 'poison',
  );
  check('Schlackenherr hinterlässt Pfützen', Boolean(pool), `(${room.state.hazards.size})`);
}
{
  // Die Brutmutter zerfällt in Brutlinge.
  const room = makeRoom('harbor');
  join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  const brood = room.systems.world.spawnZombie('brood', { x: 1200, y: 800 });
  let broodId = '';
  room.state.zombies.forEach((candidate, id) => {
    if (candidate === brood) broodId = id;
  });
  room.systems.world.damageZombie(broodId, brood, 1e9, 'p1');
  const broodlings = [...room.state.zombies.values()].filter((z) => z.type === 'broodling');
  check('Brutmutter teilt sich beim Sterben', broodlings.length === 2, `(${broodlings.length})`);
}
{
  // Der Feldmarschall flickt seine Horde zusammen.
  const room = makeRoom('base');
  join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  const warlord = room.systems.world.spawnZombie('warlord', { x: 1200, y: 800 });
  const hurt = room.systems.world.spawnZombie('normal', { x: 1260, y: 800 });
  hurt.health = 5;
  const healIndex = ZOMBIES.warlord.abilities.findIndex((a) => a.kind === 'heal');
  warlord.abilityTimers[healIndex] = 0.01;
  room.update(50);
  check('Feldmarschall heilt seine Horde', hurt.health > 5, `(${hurt.health})`);
}
{
  // Der Sogfürst zieht den Trupp zu sich.
  const room = makeRoom('subway');
  const player = join(room, 'p1');
  startCombat(room);
  room.systems.waves.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  player.x = 900;
  player.y = 800;
  const vortex = room.systems.world.spawnZombie('vortex', { x: 1400, y: 800 });
  const pullIndex = ZOMBIES.vortex.abilities.findIndex((a) => a.kind === 'vortex' && !a.push);
  vortex.abilityTimers[pullIndex] = 0.01;
  const runtime = room.systems.world.runtime.get('p1');
  room.update(50);
  check('Sogfürst zieht den Spieler an', runtime.pushX > 0, `(${Math.round(runtime.pushX)})`);
}

console.log('\n== Jede Karte hat ihren eigenen Boss ==');
{
  const dedicatedMaps = MAPS.filter((map) => map.mission?.kind !== 'timed');
  const bosses = dedicatedMaps.map((map) => map.boss);
  check('Neunzehn Karten', MAPS.length === 19, `(${MAPS.length})`);
  check('Kein Boss doppelt', new Set(bosses).size === bosses.length);
  check(
    'Jeder Boss ist als Boss eingestuft',
    bosses.every((boss) => ZOMBIES[boss].rank === 'boss'),
  );
  check('Alle Bosse sind vergeben', BOSSES.length === dedicatedMaps.length);
  check(
    'OMEGA heilt sich nicht',
    !(ZOMBIES.omega.abilities ?? []).some((ability) => ability.kind === 'heal'),
  );
  check(
    'OMEGA bringt Fähigkeiten der Vorgänger mit',
    (ZOMBIES.omega.abilities ?? []).length >= 6,
    `(${(ZOMBIES.omega.abilities ?? []).length})`,
  );
  check('Vier Mini-Bosse plus Brutling', MINI_BOSSES.length === 4);
  check('Dreiundzwanzig Türme', TURRET_ORDER.length === 23, `(${TURRET_ORDER.length})`);
  const aegis = MAPS.find((map) => map.id === 'aegis');
  check(
    'Aegis schickt ausschließlich Frontschild-Gegner',
    Boolean(
      aegis &&
      aegis.waves
        .flatMap((wave) => wave.zombies)
        .every((type) => Boolean(ZOMBIES[type].frontShield)),
    ),
  );
  check(
    'Signalkern-Mission ist eingeplant',
    MAPS.some((map) => map.mission?.kind === 'holdout'),
  );
  check(
    'Konvoi-Mission ist eingeplant',
    MAPS.some((map) => map.mission?.kind === 'escort'),
  );
  const swarmWaves = MAPS.flatMap((map) => map.waves).filter((wave) => wave.kind === 'swarm');
  check('Schwarmwellen sind eingeplant', swarmWaves.length > 0, `(${swarmWaves.length})`);
}

if (process.argv.includes('--quick')) {
  console.log(
    `\n${failures.length === 0 ? 'Alle schnellen Prüfungen bestanden.' : `Fehlgeschlagen: ${failures.join(', ')}`}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

console.log('\n== Kampagnen-Missionsziele ==');
{
  const relayRoom = makeRoom('relay');
  join(relayRoom, 'p1');
  startCombat(relayRoom);
  check(
    'Signalkern wird als Missionsziel aktiviert',
    relayRoom.state.objectiveActive && relayRoom.state.objectiveKind === 'holdout',
  );
  const relayHealth = relayRoom.state.objectiveHealth;
  relayRoom.systems.world.damageObjective(250);
  check('Signalkern kann Schaden nehmen', relayRoom.state.objectiveHealth < relayHealth);
  relayRoom.systems.world.damageObjective(relayRoom.state.objectiveMaxHealth * 1000);
  check('Zerstörter Signalkern beendet den Run', relayRoom.state.phase === 'gameover');

  const convoyRoom = makeRoom('convoy');
  const escort = join(convoyRoom, 'p1');
  startCombat(convoyRoom);
  escort.x = convoyRoom.state.objectiveX;
  escort.y = convoyRoom.state.objectiveY;
  const before = convoyRoom.state.objectiveProgress;
  convoyRoom.systems.waves.updateMission(1);
  check(
    'Konvoi fährt mit Begleitschutz voran',
    convoyRoom.state.objectiveProgress > before &&
      convoyRoom.state.objectiveProgress <= 1 / convoyRoom.systems.world.map.waves.length,
  );
}

console.log('\n== Kampagne pro Karte ==');
const requestedMaps = process.argv.slice(2);
const campaignMaps =
  requestedMaps.length > 0 ? MAPS.filter((map) => requestedMaps.includes(map.id)) : MAPS;
const campaignStallLimit = requestedMaps.length > 0 ? 24000 : 72000;
campaignMaps.forEach((map) => {
  const mapIndex = MAPS.indexOf(map);
  const room = makeRoom(map.id);
  let reward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') reward = payload;
  };
  // Wer die späten Karten erreicht, hat längst Gold in Upgrades gesteckt. Der Bot startet
  // deshalb auf Karte 1 nackt und wird mit jeder Karte stärker.
  const player = join(room, 'p1', {
    upgrades: {
      weaponDamage: Math.min(40, mapIndex * 5),
      reloadSpeed: Math.min(40, mapIndex * 5),
      magazineSize: Math.min(40, mapIndex * 5),
    },
  });
  startCombat(room);

  let ticks = 0;
  let waveStart = 0;
  let currentWave = 0;
  let stalled = false;
  while (room.state.phase !== 'gameover' && ticks < 400000) {
    makeInvincible(player);
    player.weapon = 'laser';
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    // Mission bots actually play the objective: they hold beside the relay or
    // follow the escort instead of camping at the original player spawn.
    if (room.state.objectiveActive) {
      player.x = room.state.objectiveX + room.state.objectiveRadius + 110;
      player.y = room.state.objectiveY;
      let nearest;
      let nearestDistance = Infinity;
      room.state.zombies.forEach((zombie) => {
        const distance = Math.hypot(zombie.x - player.x, zombie.y - player.y);
        if (distance >= nearestDistance) return;
        nearestDistance = distance;
        nearest = zombie;
      });
      // Walk around the objective when an attacker sits on its far side.
      if (nearest && nearestDistance > 145 && nearestDistance < 420) {
        const baseAngle = Math.atan2(player.y - nearest.y, player.x - nearest.x);
        for (let slot = 0; slot < 8; slot += 1) {
          const angle = baseAngle + (slot * Math.PI) / 4;
          const x = nearest.x + Math.cos(angle) * 118;
          const y = nearest.y + Math.sin(angle) * 118;
          if (!room.systems.world.canStand(x, y, 18)) continue;
          if (!room.systems.world.canTravel(x, y, nearest.x, nearest.y, 18)) continue;
          player.x = x;
          player.y = y;
          nearestDistance = 118;
          break;
        }
      }
      if (nearestDistance < 145) player.weapon = 'worldbreaker';
    } else {
      let nearest;
      let nearestDistance = Infinity;
      room.state.zombies.forEach((zombie) => {
        const distance = Math.hypot(zombie.x - player.x, zombie.y - player.y);
        if (distance >= nearestDistance) return;
        nearestDistance = distance;
        nearest = zombie;
      });
      let bossEngaged = false;
      if (nearest?.type === 'shieldbearer') {
        // The tactical bot demonstrates the intended counter: step around the
        // slowly turning plate and finish the isolated carrier in melee.
        for (const side of [1, -1]) {
          const angle = nearest.rotation + side * (Math.PI / 2);
          const x = nearest.x + Math.cos(angle) * 105;
          const y = nearest.y + Math.sin(angle) * 105;
          if (!room.systems.world.canStand(x, y, 18)) continue;
          if (!room.systems.world.canTravel(x, y, nearest.x, nearest.y, 18)) continue;
          player.x = x;
          player.y = y;
          player.weapon = 'worldbreaker';
          bossEngaged = true;
          break;
        }
      } else if (nearest && ZOMBIES[nearest.type].rank === 'boss') {
        for (let slot = 0; slot < 12; slot += 1) {
          const angle = (slot * Math.PI) / 6;
          const x = Math.max(
            ARENA.padding,
            Math.min(ARENA.width - ARENA.padding, nearest.x + Math.cos(angle) * 118),
          );
          const y = Math.max(
            ARENA.padding,
            Math.min(ARENA.height - ARENA.padding, nearest.y + Math.sin(angle) * 118),
          );
          if (!room.systems.world.canStand(x, y, 18)) continue;
          player.x = x;
          player.y = y;
          player.weapon = 'worldbreaker';
          bossEngaged = true;
          break;
        }
      }
      const sightBlocked =
        nearest && !room.systems.world.canTravel(player.x, player.y, nearest.x, nearest.y, 18);
      if (!bossEngaged && nearest && (sightBlocked || nearestDistance > 850)) {
        for (let slot = 0; slot < 12; slot += 1) {
          const angle = (slot * Math.PI) / 6;
          const x = nearest.x + Math.cos(angle) * 240;
          const y = nearest.y + Math.sin(angle) * 240;
          if (!room.systems.world.canStand(x, y, 18)) continue;
          if (!room.systems.world.canTravel(x, y, nearest.x, nearest.y, 18)) continue;
          player.x = x;
          player.y = y;
          break;
        }
      }
    }
    if (room.state.phase === 'build') room.systems.waves.startNextWave();
    step(room, 1, 'p1');
    ticks += 1;
    if (room.state.wave !== currentWave) {
      currentWave = room.state.wave;
      waveStart = ticks;
    }
    // Die letzten Karten sind Marathons: eine Welle darf lange dauern, aber
    // nach einer Stunde Spielzeit hängt sie wirklich.
    if (ticks - waveStart > campaignStallLimit) {
      stalled = true;
      break;
    }
  }
  check(
    `${map.name}: alle ${map.waves.length} Wellen geschafft`,
    !stalled && reward !== null && reward.victory,
    stalled
      ? `(Welle ${currentWave} hängt: ${room.state.zombies.size} aktiv, ` +
          `${room.systems.waves.spawnQueue.length} warten, Ziel ${Math.round(room.state.objectiveProgress * 100)} %, ` +
          `${[...room.state.zombies.values()]
            .slice(0, 4)
            .map(
              (zombie) =>
                `${zombie.type}@${Math.round(zombie.x)},${Math.round(zombie.y)}:${Math.round(zombie.health)}`,
            )
            .join(' ')})`
      : '',
  );
  console.log(
    `  info ${Math.round((ticks * 0.05) / 60)} min Kampfzeit, ${player.kills} Abschüsse,` +
      ` ${reward ? reward.gold : 0} Gold`,
  );
});

console.log(
  `\n${failures.length === 0 ? 'Alle Prüfungen bestanden.' : `Fehlgeschlagen: ${failures.join(', ')}`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
