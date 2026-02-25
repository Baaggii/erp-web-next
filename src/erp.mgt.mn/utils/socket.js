import { io } from 'socket.io-client';

let socket;
let refs = 0;
let wired = false;
const listeners = new Set();

function resolveSocketUrl() {
  const socketUrl = import.meta.env.VITE_SOCKET_URL;

  if (!socketUrl) {
    throw new Error(
      'VITE_SOCKET_URL is required for Socket.IO connection. Set it in your .env file.',
    );
  }

  return socketUrl.replace(/\/$/, '');
}

function notifyListeners(connected) {
  listeners.forEach((listener) => {
    try {
      listener(connected);
    } catch {
      // ignore listener errors
    }
  });
}

function wireSocketEvents() {
  if (!socket || wired) return;
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    notifyListeners(true);
  });
  socket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
    notifyListeners(false);
  });
  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    notifyListeners(false);
  });
  wired = true;
  notifyListeners(socket.connected);
}

export function connectSocket() {
  if (!socket) {
    const baseUrl = resolveSocketUrl();
    const path = import.meta.env.VITE_SOCKET_PATH || '/api/socket.io';

    socket = io(baseUrl, {
      path,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }

  wireSocketEvents();

  if (!socket.connected) {
    socket.connect();
  }

  refs += 1;
  return socket;
}

export function disconnectSocket() {
  refs -= 1;
  if (refs <= 0 && socket) {
    if (wired) {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      wired = false;
    }
    socket.disconnect();
    socket = undefined;
    refs = 0;
  }
}

export function onSocketStatusChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  if (socket) {
    listener(socket.connected);
  }
  return () => listeners.delete(listener);
}
