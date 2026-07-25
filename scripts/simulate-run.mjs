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
  BOSSES,
  DASH_SECONDS,
  DEFENSES,
  MAPS,
  MINI_BOSSES,
  REPAIR_COST_PER_HP,
  TURRET_ORDER,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  reserveCapacity,
  sellRefund,
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

function makeRoom(mapId) {
  const room = new ZombieRoom();
  room.clients = [];
  room.broadcast = () => {};
  room.setSimulationInterval = () => {};
  room.onCreate({ lobbyCode: 'SIM01', mapId });
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

console.log('\n== Erste Welle auf Vorposten 07 ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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
  room.systems.waves.startRun();
  room.systems.waves.spawnQueue = [];
  makeInvincible(player);

  for (const weapon of WEAPON_ORDER) {
    room.state.zombies.clear();
    room.state.projectiles.clear();
    const pack = [];
    for (let index = 0; index < 8; index += 1) {
      const zombie = room.systems.world.spawnZombie('normal', { x: 760 + index * 26, y: 800 });
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
        zombie.x = 760 + index * 26;
        zombie.y = 800;
      });
      player.ammo = 9999;
      player.reserveAmmo = 9999;
      player.reloading = 0;
      runtime.input = { ...IDLE, shoot: true, aimX: 760, aimY: 800 };
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
  room.systems.waves.startRun();
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1186;
  player.y = 1150;

  const types = Object.keys(DEFENSES);
  types.forEach((type, index) => {
    room.systems.build.placeDefense('p1', { type, x: 880 + index * 68, y: 1150, rotation: 0 });
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

console.log('\n== Neue Türme wirken ==');
for (const type of ['flame', 'tesla', 'laser']) {
  const room = makeRoom('crater');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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

console.log('\n== Bauen, Reparieren, Verkaufen ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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

  // Sobald die nächste Welle läuft, ist der Bau gebraucht.
  room.systems.waves.startNextWave();
  check('Nach dem Wellenstart nur noch Teilerlös', remaining.refund === sellRefund('wood'));
  room.systems.waves.finishWave();
  player.x = remaining.x;
  player.y = remaining.y + 40;
  const beforeUsedSell = player.money;
  room.systems.build.sellDefense('p1', remaining.id);
  check(
    'Älterer Bau zahlt den Teilerlös',
    room.state.defenses.size === 0 && player.money === beforeUsedSell + sellRefund('wood'),
    `(${player.money - beforeUsedSell} $)`,
  );
}

console.log('\n== Einmalige Vorteile ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1', {
    perks: { starterWeapon: true, starterBarricade: true, starterTurret: true, engineer: true },
  });
  room.systems.waves.startRun();
  room.systems.waves.finishWave();
  player.money = 1e6;
  player.x = 1200;
  player.y = 1150;

  const beforeWeapon = player.money;
  room.systems.build.buyWeapon('p1', 'smg');
  const paid = beforeWeapon - player.money;
  check(
    'Erste Waffe ist günstiger',
    paid < WEAPONS.smg.cost && paid > 0,
    `(${paid} statt ${WEAPONS.smg.cost})`,
  );
  const beforeSecond = player.money;
  room.systems.build.buyWeapon('p1', 'rifle');
  check(
    'Zweite Waffe kostet wieder voll',
    beforeSecond - player.money === WEAPONS.rifle.cost,
    `(${beforeSecond - player.money})`,
  );

  const beforeWall = player.money;
  room.systems.build.placeDefense('p1', { type: 'wood', x: 1200, y: 1050, rotation: 0 });
  check(
    'Erste Barrikade ist günstiger',
    beforeWall - player.money < DEFENSES.wood.cost,
    `(${beforeWall - player.money})`,
  );

  const beforeTurret = player.money;
  room.systems.build.placeDefense('p1', { type: 'mg', x: 1330, y: 1150, rotation: 0 });
  check(
    'Erster Turm ist günstiger',
    beforeTurret - player.money < DEFENSES.mg.cost,
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
  const player = join(room, 'p1', { upgrades: { dashCharges: 1 }, perks: { extraDash: true } });
  const runtime = room.systems.world.runtime.get('p1');
  room.systems.waves.startRun();
  room.systems.waves.spawnQueue = ['normal'];
  room.systems.waves.spawnDelay = 1e6;
  room.state.zombies.clear();

  check('Vier Ladungen mit Stufe und Vorteil', player.dashMax === 4, `(${player.dashMax})`);
  const startX = player.x;
  runtime.input = { ...IDLE, dash: true, right: true, aimX: player.x + 200, aimY: player.y };
  room.update(50);
  check('Dash verbraucht eine Ladung', player.dashCharges === 3, `(${player.dashCharges})`);
  check('Dash läuft', player.dashing > 0);

  const healthBefore = player.health;
  room.systems.world.damagePlayer(player, 5000);
  check('Während des Dashes unverwundbar', player.health === healthBefore);

  runtime.input = { ...IDLE, right: true, aimX: player.x + 200, aimY: player.y };
  step(room, Math.ceil((DASH_SECONDS * 1000) / 50) + 2);
  check('Dash endet von selbst', player.dashing === 0);
  check('Dash bringt Strecke', player.x - startX > 60, `(${Math.round(player.x - startX)} px)`);

  room.systems.world.damagePlayer(player, 40);
  check('Nach dem Dash trifft Schaden wieder', player.health < healthBefore);

  step(room, 100);
  check('Ladung lädt nach', player.dashCharges === 4, `(${player.dashCharges})`);
}

console.log('\n== Geld wird geteilt ==');
{
  const room = makeRoom('outpost');
  const shooter = join(room, 'p1');
  const helper = join(room, 'p2');
  room.systems.waves.startRun();
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

  check('Der Schütze bekommt den größten Teil', shooter.money > helper.money);
  check('Der Mitspieler geht nicht leer aus', helper.money > 0, `(${helper.money} $)`);
  check(
    'Zusammen ergibt es die volle Prämie',
    Math.abs(shooter.money + helper.money - ZOMBIES.normal.reward) <= 2,
    `(${shooter.money} + ${helper.money} statt ${ZOMBIES.normal.reward})`,
  );
  check('Der Abschuss zählt für den Schützen', shooter.kills === 1 && helper.kills === 0);
}

console.log('\n== Wellenende heilt den Trupp ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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

console.log('\n== Arsenal ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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

  player.ammo = 7;
  room.systems.build.selectWeapon('p1', 'smg');
  check('Wechsel auf eine besessene Waffe', player.weapon === 'smg');
  room.systems.build.selectWeapon('p1', 'rifle');
  check('Munition bleibt pro Waffe erhalten', player.ammo === 7, `(${player.ammo})`);

  room.systems.build.selectWeapon('p1', 'laser');
  check('Nicht gekaufte Waffe bleibt gesperrt', player.weapon === 'rifle');

  room.systems.build.selectWeapon('p1', 'pistol');
  check('Startwaffe bleibt jederzeit verfügbar', player.weapon === 'pistol');

  const money = player.money;
  player.reserveAmmo = reserveCapacity('pistol');
  room.systems.build.buyAmmo('p1');
  check('Kein Munitionskauf bei vollem Vorrat', player.money === money);
  player.reserveAmmo = 10;
  room.systems.build.buyAmmo('p1');
  check(
    'Munitionskauf füllt bis zum Maximum',
    player.money < money && player.reserveAmmo === reserveCapacity('pistol'),
    `(${player.reserveAmmo})`,
  );
}

console.log('\n== Feuerrate ==');
{
  const room = makeRoom('outpost');
  const player = join(room, 'p1');
  const runtime = room.systems.world.runtime.get('p1');
  room.systems.waves.startRun();
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
  room.systems.waves.startRun();
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

  player.grenades = 3;
  room.systems.players.throwGrenade('p1', { x: 1300, y: 800 });
  check('Granate verbraucht', player.grenades === 2);
}

console.log('\n== Boss-Fähigkeiten ==');
{
  // Warnkreis: der Zerreißer kündigt seine Druckwelle an, bevor sie trifft.
  const room = makeRoom('citadel');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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
  check('Warnkreis schlägt danach ein', player.health < healthBefore || room.state.hazards.size === 0);
}
{
  // Lavapfützen bleiben liegen und tun weh.
  const room = makeRoom('foundry');
  const player = join(room, 'p1');
  room.systems.waves.startRun();
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
  room.systems.waves.startRun();
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
  room.systems.waves.startRun();
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
  room.systems.waves.startRun();
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
  const bosses = MAPS.map((map) => map.boss);
  check('Zehn Karten', MAPS.length === 10, `(${MAPS.length})`);
  check('Kein Boss doppelt', new Set(bosses).size === bosses.length);
  check(
    'Jeder Boss ist als Boss eingestuft',
    bosses.every((boss) => ZOMBIES[boss].rank === 'boss'),
  );
  check('Alle Bosse sind vergeben', BOSSES.length === MAPS.length);
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
  check('Sechs Türme', TURRET_ORDER.length === 6, `(${TURRET_ORDER.length})`);
  const swarmWaves = MAPS.flatMap((map) => map.waves).filter((wave) => wave.kind === 'swarm');
  check('Schwarmwellen sind eingeplant', swarmWaves.length > 0, `(${swarmWaves.length})`);
}

console.log('\n== Kampagne pro Karte ==');
MAPS.forEach((map, mapIndex) => {
  const room = makeRoom(map.id);
  let reward = null;
  room.broadcast = (type, payload) => {
    if (type === 'permanent_reward') reward = payload;
  };
  // Wer Karte 9 erreicht, hat längst Gold in Upgrades gesteckt. Der Bot startet
  // deshalb auf Karte 1 nackt und wird mit jeder Karte stärker.
  const player = join(room, 'p1', {
    upgrades: {
      weaponDamage: Math.min(40, mapIndex * 5),
      reloadSpeed: Math.min(40, mapIndex * 5),
      magazineSize: Math.min(40, mapIndex * 5),
    },
  });
  room.systems.waves.startRun();

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
    if (room.state.phase === 'build') room.systems.waves.startNextWave();
    step(room, 1, 'p1');
    ticks += 1;
    if (room.state.wave !== currentWave) {
      currentWave = room.state.wave;
      waveStart = ticks;
    }
    // Die letzten Karten sind Marathons: eine Welle darf lange dauern, aber
    // nach einer Stunde Spielzeit hängt sie wirklich.
    if (ticks - waveStart > 72000) {
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
});

console.log(
  `\n${failures.length === 0 ? 'Alle Prüfungen bestanden.' : `Fehlgeschlagen: ${failures.join(', ')}`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
