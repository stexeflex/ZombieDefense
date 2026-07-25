/**
 * Headless-Rauchtest für die Spiellogik.
 *
 * Startet echte Räume ohne Netzwerk, spielt Wellen mit einem Bot durch und
 * prüft Waffen, Verteidigungen, Bosse und den Weg bis zum Endboss. Nützlich
 * nach Änderungen an Balancing oder Server-Logik.
 *
 * Aufruf: npm run sim
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);

const { ZombieRoom } = await load('server/build/server/src/rooms/zombie-room.js');
const { DEFENSES, MAPS, WEAPONS, WEAPON_ORDER } = await load('server/build/shared/game-types.js');

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`  FEHLER ${name} ${detail}`);
}

function makeRoom(mapId) {
  const room = new ZombieRoom();
  room.clients = [];
  room.broadcast = () => {};
  room.setSimulationInterval = () => {};
  room.onCreate({ lobbyCode: 'SIM01', mapId });
  return room;
}

function join(room, id) {
  room.onJoin({ sessionId: id }, { name: id, upgrades: {} });
  return room.state.players.get(id);
}

function aimAtNearest(room, id) {
  const player = room.state.players.get(id);
  const runtime = room.runtimePlayers.get(id);
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
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: Boolean(best),
    reload: false,
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

console.log('\n== Erste Welle auf Vorposten 07 ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.startRun();
  check('Kampfphase gestartet', room.state.phase === 'combat');

  let ticks = 0;
  while (room.state.phase === 'combat' && ticks < 6000) {
    makeInvincible(player);
    step(room, 1, 'p1');
    ticks += 1;
  }
  check('Welle endet', room.state.phase === 'build', `(${room.state.phase})`);
  check('Abschüsse gezählt', player.kills > 0);
  check('Geld verdient', player.money > 400);
  console.log(`  info ${ticks} Ticks, ${player.kills} Abschüsse, ${player.money} $`);
}

console.log('\n== Alle Waffen treffen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.startRun();
  room.spawnQueue = [];
  makeInvincible(player);

  for (const weapon of WEAPON_ORDER) {
    room.state.zombies.clear();
    room.state.projectiles.clear();
    const pack = [];
    for (let index = 0; index < 8; index += 1) {
      const zombie = room.spawnZombie('normal', { x: 760 + index * 26, y: 800 });
      zombie.health = 400;
      zombie.maxHealth = 400;
      pack.push(zombie);
    }
    player.x = 600;
    player.y = 800;
    player.weapon = weapon;
    player.fireCooldown = 0;
    const before = pack.reduce((sum, zombie) => sum + zombie.health, 0);
    const runtime = room.runtimePlayers.get('p1');
    for (let tick = 0; tick < 40; tick += 1) {
      pack.forEach((zombie, index) => {
        zombie.x = 760 + index * 26;
        zombie.y = 800;
      });
      player.ammo = 9999;
      player.reserveAmmo = 9999;
      player.reloading = 0;
      runtime.input = {
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: true,
        reload: false,
        aimX: 760,
        aimY: 800,
      };
      room.update(50);
    }
    const after = pack.reduce((sum, zombie) => sum + Math.max(0, zombie.health), 0);
    check(
      `${WEAPONS[weapon].label} trifft (~${Math.round((before - after) / 2)} Schaden/s)`,
      after < before,
    );
  }
}

console.log('\n== Verteidigungen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.startRun();
  room.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;

  const types = Object.keys(DEFENSES);
  types.forEach((type, index) => {
    room.placeDefense('p1', { type, x: 1050 + index * 70, y: 1150, rotation: 0 });
  });
  check('Jede Verteidigung lässt sich bauen', room.state.defenses.size === types.length);

  room.startNextWave();
  room.spawnQueue = [];
  makeInvincible(player);
  for (let index = 0; index < 25; index += 1) {
    room.spawnZombie('normal', { x: 1150 + index * 12, y: 1000 });
  }
  step(room, 400, 'p1');
  check('Zombies werden bekämpft', room.state.zombies.size < 25, `(${room.state.zombies.size})`);
}

console.log('\n== Sonderzombies ==');
{
  const room = makeRoom('crater');
  const player = join(room, 'p1');
  room.startRun();
  room.spawnQueue = [];
  room.state.zombies.clear();
  makeInvincible(player);
  player.weapon = 'laser';
  player.x = 1200;
  player.y = 800;

  const boss = room.spawnZombie('boss', { x: 1500, y: 800 });
  const brute = room.spawnZombie('brute', { x: 900, y: 800 });
  const exploder = [...room.state.zombies.entries()].find(([, z]) => z.type === 'exploder');
  room.spawnZombie('exploder', { x: 1250, y: 820 });
  check('Boss hat Boss-Leben', boss.maxHealth > 5000);

  step(room, 40);
  room.updateBossBar();
  check('Boss-Leiste gefüllt', room.state.bossMaxHealth > 0 && room.state.bossName.length > 0);

  const runtime = room.runtimePlayers.get('p1');
  for (let tick = 0; tick < 240; tick += 1) {
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    runtime.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      shoot: true,
      reload: false,
      aimX: boss.x,
      aimY: boss.y,
    };
    room.update(50);
  }
  check('Boss nimmt Schaden', boss.health < boss.maxHealth);
  check('Mini-Boss stürmt', brute.chargeTimer < 99);
  check(
    'Explodierer detoniert',
    !exploder || !room.state.zombies.has(exploder[0]),
  );

  player.grenades = 3;
  room.throwGrenade('p1', { x: 1300, y: 800 });
  check('Granate verbraucht', player.grenades === 2);
}

console.log('\n== Kampagne pro Karte ==');
for (const map of MAPS) {
  const room = makeRoom(map.id);
  let reward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') reward = payload;
  };
  const player = join(room, 'p1');
  room.startRun();

  let ticks = 0;
  let waveStart = 0;
  let currentWave = 0;
  let stalled = false;
  while (room.state.phase !== 'gameover' && ticks < 200000) {
    makeInvincible(player);
    player.weapon = 'laser';
    player.ammo = 9999;
    player.reserveAmmo = 9999;
    player.reloading = 0;
    if (room.state.phase === 'build') room.state.nextWaveIn = 0;
    step(room, 1, 'p1');
    ticks += 1;
    if (room.state.wave !== currentWave) {
      currentWave = room.state.wave;
      waveStart = ticks;
    }
    if (ticks - waveStart > 30000) {
      stalled = true;
      break;
    }
  }
  check(
    `${map.name}: alle ${map.waves.length} Wellen geschafft`,
    !stalled && reward !== null && reward.victory,
    stalled ? `(Welle ${currentWave} hängt)` : '',
  );
  console.log(
    `  info ${Math.round((ticks * 0.05) / 60)} min Kampfzeit, ${player.kills} Abschüsse,` +
      ` ${reward ? reward.gold : 0} Gold`,
  );
}

console.log(
  `\n${failures.length === 0 ? 'Alle Prüfungen bestanden.' : `Fehlgeschlagen: ${failures.join(', ')}`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
