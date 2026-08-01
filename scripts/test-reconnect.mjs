import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { Client } from '@colyseus/sdk';

const PORT = 2571;
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const CODE = 'RJN01';
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${ENDPOINT}/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await timeout(100);
  }
  throw new Error('Testserver wurde nicht rechtzeitig erreichbar.');
}

function waitForSnapshot(room, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Snapshot-Bedingung wurde nicht rechtzeitig erfüllt.'));
    }, timeoutMs);
    const unsubscribe = room.onMessage('snapshot', (snapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(snapshot);
    });
  });
}

let serverOutput = '';
const server = spawn(process.execPath, ['server/build/server/src/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => (serverOutput += chunk));
server.stderr.on('data', (chunk) => (serverOutput += chunk));

try {
  await waitForServer();

  const firstClient = new Client(ENDPOINT);
  const firstRoom = await firstClient.create('zombie_defense', {
    lobbyCode: CODE,
    name: 'Rejoin-Test',
    upgrades: { startMoney: 20 },
  });
  const sessionId = firstRoom.sessionId;
  const reconnectionToken = firstRoom.reconnectionToken;

  firstRoom.send('start');
  await waitForSnapshot(firstRoom, (snapshot) => snapshot.phase === 'build');
  firstRoom.send('buy_weapon', 'smg');
  await waitForSnapshot(firstRoom, (snapshot) =>
    snapshot.players[sessionId]?.owned.includes('smg'),
  );
  firstRoom.send('place', { type: 'mg', x: 1320, y: 800, rotation: 0 });
  const beforeDrop = await waitForSnapshot(firstRoom, (snapshot) =>
    Object.values(snapshot.defenses).some((defense) => defense.ownerId === sessionId),
  );
  const original = beforeDrop.players[sessionId];
  const originalDefenseIds = Object.values(beforeDrop.defenses)
    .filter((defense) => defense.ownerId === sessionId)
    .map((defense) => defense.id)
    .sort();

  // A separate tab has no reconnect token. It joins as a fresh session and
  // therefore receives no second copy of the running game's start money.
  const tabClient = new Client(ENDPOINT);
  const tabRoom = await tabClient.joinOrCreate('zombie_defense', {
    lobbyCode: CODE,
    name: 'Neuer Tab',
    upgrades: { startMoney: 40 },
  });
  const tabSnapshot = await waitForSnapshot(tabRoom, (snapshot) =>
    Boolean(snapshot.players[tabRoom.sessionId]),
  );
  assert.equal(tabSnapshot.players[tabRoom.sessionId].money, 0);
  await tabRoom.leave(true);

  // Disable the SDK's same-object retry so the test exercises the persisted
  // token path used after a browser refresh.
  firstRoom.reconnection.enabled = false;
  await firstRoom.leave(false);
  await timeout(150);

  const returningClient = new Client(ENDPOINT);
  const returningRoom = await returningClient.reconnect(reconnectionToken);
  assert.equal(returningRoom.sessionId, sessionId);
  const restored = await waitForSnapshot(returningRoom, (snapshot) =>
    Boolean(snapshot.players[sessionId]),
  );
  const returned = restored.players[sessionId];
  const restoredDefenseIds = Object.values(restored.defenses)
    .filter((defense) => defense.ownerId === sessionId)
    .map((defense) => defense.id)
    .sort();

  assert.equal(returned.money, original.money);
  assert.equal(returned.weapon, original.weapon);
  assert.deepEqual(returned.owned, original.owned);
  assert.equal(returned.ammo, original.ammo);
  assert.equal(returned.reserveAmmo, original.reserveAmmo);
  assert.deepEqual(restoredDefenseIds, originalDefenseIds);

  await returningRoom.leave(true);
  console.log('Rejoin behält Session, Inventar, Geld und Bau-Besitz; ein neuer Tab erhält 0 $.');
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  server.kill();
}
