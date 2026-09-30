import { io, Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function connectSocket(sessionCode: string, memberId: string): Socket {
  const opts: Partial<ManagerOptions & SocketOptions> = {
    auth: { sessionCode, memberId },
    transports: ['websocket', 'polling'],
  };
  return API_URL ? io(API_URL, opts) : io(opts);
}
