import { defineRoom, defineServer } from 'colyseus';
import { ZombieRoom } from './rooms/zombie-room.js';

export const server = defineServer({
  rooms: {
    zombie_defense: defineRoom(ZombieRoom).filterBy(['lobbyCode']),
  },
  express: (app) => {
    app.get('/', (_request: unknown, response: { json: (body: unknown) => void }) => {
      response.json({
        name: 'Zombie Defense Server',
        status: 'online',
      });
    });
    app.get(
      '/health',
      (_request: unknown, response: { json: (body: unknown) => void }) =>
        response.json({ ok: true }),
    );
  },
});

export default server;
