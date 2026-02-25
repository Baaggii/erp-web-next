import { io } from 'socket.io-client';
import { API_ROOT } from './apiBase.js';

let socket;
let refs = 0;
let wired = false;
const listeners = new Set();
const socketPath = import.meta.env.VITE_SOCKET_PATH || '/api/socket.io';
let warnedMissingSocketUrl = false;

function resolveSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (API_ROOT) {
    return API_ROOT;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (!warnedMissingSocketUrl) {
      console.error(
        'VITE_SOCKET_URL is not set; falling back to the current origin for Socket.IO.',
      );
      warnedMissingSocketUrl = true;
    }
    return window.location.origin;
  }
  if (!warnedMissingSocketUrl) {
    console.error('VITE_SOCKET_URL is not set and no fallback origin is available.');
    warnedMissingSocketUrl = true;
  }
  return undefined;
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
  socket.on('connect_error', (err) => {
    console.error('Socket connection error', err);
    notifyListeners(false);
  });
  wired = true;
  notifyListeners(socket.connected);
}

export function connectSocket() {
  if (!socket) {
    const url = resolveSocketUrl();
    socket = io(url, { withCredentials: true, path: socketPath, autoConnect: true });
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
