import { io } from 'socket.io-client';

const SOCKET_OPTIONS = {
  withCredentials: true,
  path: '/socket.io',
  timeout: 10000,
  reconnectionAttempts: 5,
  autoConnect: false,
};

const AUTH_COOKIE_NAMES = (
  import.meta.env.VITE_SOCKET_COOKIE_NAMES || import.meta.env.VITE_SOCKET_COOKIE_NAME
)
  ?.split(',')
  .map((n) => n.trim())
  .filter(Boolean) || ['token'];

let socket;
let refs = 0;

function hasAuthCookie() {
  if (typeof document === 'undefined') return false;
  const cookies = document.cookie || '';
  return AUTH_COOKIE_NAMES.some((name) =>
    new RegExp(`(?:^|;\\s*)${name}=`).test(cookies),
  );
}

function teardownSocket(reason) {
  if (socket) {
    console.warn('Disabling socket connection', reason);
    socket.removeAllListeners();
    socket.disconnect();
    socket = undefined;
    refs = 0;
  }
}

function attachLoggingEvents(instance) {
  instance.on('connect_error', (err) => {
    const message = err?.message || err;
    console.error('Socket connection failed', message);
    if (String(message).toLowerCase().includes('authentication')) {
      teardownSocket('authentication error');
    }
  });
  instance.on('reconnect_failed', () => {
    console.error('Socket reconnection attempts exhausted');
    teardownSocket('reconnection exhausted');
  });
}

function canConnect() {
  if (typeof window === 'undefined') return false;
  if (!hasAuthCookie()) {
    console.info('Skipping socket connection because auth cookie is missing');
    return false;
  }
  return true;
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
