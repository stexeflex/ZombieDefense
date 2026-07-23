import { defineRoom, defineServer } from 'colyseus';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZombieRoom } from './rooms/zombie-room.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = [
  resolve(process.cwd(), 'dist', 'zombie-defense', 'browser'),
  resolve(currentDirectory, '..', '..', 'dist', 'zombie-defense', 'browser'),
  resolve(currentDirectory, '..', '..', '..', '..', 'dist', 'zombie-defense', 'browser'),
].find((candidate) => existsSync(resolve(candidate, 'index.html')));

export const server = defineServer({
  rooms: {
    zombie_defense: defineRoom(ZombieRoom).filterBy(['lobbyCode']),
  },
  express: (app) => {
    app.get(
      '/health',
      (_request: unknown, response: { json: (body: unknown) => void }) =>
        response.json({ ok: true }),
    );

    if (webRoot) {
      const indexFile = resolve(webRoot, 'index.html');
      app.use(express.static(webRoot));
      app.get('*path', (_request, response) => response.sendFile(indexFile));
      return;
    }

    app.get('/', (_request, response) => {
      response.json({
        name: 'Zombie Defense Server',
        status: 'online',
      });
    });
  },
});

export default server;
