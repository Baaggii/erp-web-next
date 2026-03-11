import { io } from 'socket.io-client';
import { API_ROOT } from './apiBase.js';

let socket;
let refs = 0;
let wired = false;
const listeners = new Set();
let reconnectBlockedUntil = 0;

const AUTH_RETRY_COOLDOWN_MS = 60 * 1000;

function shouldBlockReconnect(err) {
  const message = String(err?.message || '').toLowerCase();
  const description = String(err?.description || '').toLowerCase();
  const context = `${message} ${description}`;

  if (context.includes('authentication error')) return true;
  if (context.includes('forbidden')) return true;
  if (context.includes('status code 403')) return true;
  if (Number(err?.description) === 403) return true;

  return false;
}

function blockReconnect() {
  reconnectBlockedUntil = Date.now() + AUTH_RETRY_COOLDOWN_MS;
  if (!socket) return;
  socket.io.opts.reconnection = false;
  socket.disconnect();
}

function resolveSocketUrl() {
  const socketUrl = String(import.meta.env.VITE_SOCKET_URL || '').trim();
  if (socketUrl) return socketUrl.replace(/\/$/, '').replace(/\/api\/?$/, '');

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
    reconnectBlockedUntil = 0;
    socket.io.opts.reconnection = true;
    console.log('Socket connected:', socket.id);
    notifyListeners(true);
  });
  socket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
    notifyListeners(false);
  });
  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    if (shouldBlockReconnect(err)) {
      blockReconnect();
    }
    notifyListeners(false);
  });
  socket.io.on('reconnect', () => {
    notifyListeners(true);
  });
  wired = true;
  notifyListeners(socket.connected);
}

export function connectSocket() {
  if (Date.now() < reconnectBlockedUntil && socket) {
    return socket;
  }

  if (!socket) {
    const baseUrl = resolveSocketUrl();
    const path = import.meta.env.VITE_SOCKET_PATH || '/api/socket.io';

    socket = io(baseUrl, {
      path,
      withCredentials: true,
      transports: ['polling', 'websocket'],
      autoConnect: true,
      timeout: 10000,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
    });
  }

  wireSocketEvents();

  if (socket) {
    socket.io.opts.reconnection = true;
  }

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
