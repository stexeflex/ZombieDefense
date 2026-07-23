import { defineRoom, defineServer } from 'colyseus';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZombieRoom } from './rooms/zombie-room.js';

const webRoot = resolve(process.cwd(), 'dist', 'zombie-defense', 'browser');
const indexFile = resolve(webRoot, 'index.html');

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

    if (existsSync(indexFile)) {
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
