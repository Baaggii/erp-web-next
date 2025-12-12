import { io } from 'socket.io-client';

const SOCKET_OPTIONS = {
  withCredentials: true,
  path: '/socket.io',
  timeout: 10000,
  reconnectionAttempts: 5,
};

let socket;
let refs = 0;

function attachLoggingEvents(instance) {
  instance.on('connect_error', (err) => {
    console.error('Socket connection failed', err?.message || err);
  });
  instance.on('reconnect_failed', () => {
    console.error('Socket reconnection attempts exhausted');
  });
}

export function connectSocket() {
  if (!canConnect()) return undefined;

  if (!socket) {
    const url = import.meta.env.VITE_SOCKET_URL || '';
    socket = io(url, SOCKET_OPTIONS);
    attachLoggingEvents(socket);
  }
  refs += 1;
  if (socket.disconnected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  refs -= 1;
  if (refs <= 0 && socket) {
    socket.disconnect();
    socket = undefined;
    refs = 0;
  }
}
