import { io } from 'socket.io-client';
import { API_ROOT } from './apiBase.js';

let socket;
let refs = 0;
let wired = false;
const listeners = new Set();
const socketPath = import.meta.env.VITE_SOCKET_PATH || '/api/socket.io';

function resolveSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  return API_ROOT;
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
  socket.on('connect', () => notifyListeners(true));
  socket.on('disconnect', () => notifyListeners(false));
  socket.on('connect_error', () => notifyListeners(false));
  wired = true;
  notifyListeners(socket.connected);
}

export function connectSocket() {
  if (!socket) {
    const url = resolveSocketUrl();
    socket = io(url, {
      withCredentials: true,
      path: socketPath,
      transports: ['polling'],
      upgrade: false,
    });
  }
  wireSocketEvents();
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
