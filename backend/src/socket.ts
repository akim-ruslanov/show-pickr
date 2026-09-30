import type { Server, Socket } from 'socket.io';
import { prisma } from './db';
import { getSessionState, recordSwipe, roomName } from './session';
import type { SwipeDirection } from './types';

export function setupSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    const code = String(socket.handshake.auth?.sessionCode ?? '').toUpperCase();
    const memberId = String(socket.handshake.auth?.memberId ?? '');

    // Authenticate asynchronously but expose a promise so listeners can await it.
    // The auth promise and all listeners are attached synchronously, so no event
    // sent immediately after connecting is ever dropped.
    socket.data.ready = (async () => {
      if (!code || !memberId) {
        socket.disconnect(true);
        throw new Error('Missing auth');
      }
      const session = await prisma.session.findUnique({ where: { code } });
      if (!session) {
        socket.disconnect(true);
        throw new Error('Session not found');
      }
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      if (!member || member.sessionId !== session.id) {
        socket.disconnect(true);
        throw new Error('Member not in session');
      }

      socket.join(roomName(code));
      socket.data.sessionId = session.id;
      socket.data.memberId = memberId;

      await prisma.member.update({ where: { id: memberId }, data: { lastSeen: new Date() } });
      socket.to(roomName(code)).emit('member:online', { id: memberId });
      socket.emit('session:state', await getSessionState(code));
    })();

    socket.on('swipe', async (payload: any) => {
      try {
        await socket.data.ready;
        const { showId, direction } = payload ?? {};
        if (!showId || (direction !== 'yes' && direction !== 'no')) return;

        const outcome = await recordSwipe(
          socket.data.sessionId,
          socket.data.memberId,
          showId,
          direction as SwipeDirection
        );
        if ('error' in outcome) return socket.emit('error', outcome.error);

        io.to(roomName(code)).emit('swipe:recorded', {
          memberId: socket.data.memberId,
          showId,
          direction,
        });
      } catch {
        // Auth failed or socket disconnected; nothing to record.
      }
    });

    socket.on('disconnect', () => {
      socket.to(roomName(code)).emit('member:offline', { id: memberId });
    });
  });
}
