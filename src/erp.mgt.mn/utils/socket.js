import { io } from 'socket.io-client';
import { API_ROOT } from './apiBase.js';

let socket;
let refs = 0;
let wired = false;
const listeners = new Set();

function resolveSocketUrl() {
  const socketUrl = String(import.meta.env.VITE_SOCKET_URL || '').trim();
  if (socketUrl) return socketUrl.replace(/\/$/, '');

  const apiRoot = String(API_ROOT || '').trim();
  if (apiRoot) return apiRoot.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }

  throw new Error('Unable to resolve Socket.IO URL. Configure VITE_SOCKET_URL.');
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
  socket.io.on('reconnect', () => {
    notifyListeners(true);
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
      socket.io.off('reconnect');
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
