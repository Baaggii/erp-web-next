import { io } from 'socket.io-client';
import { API_ROOT } from './apiBase.js';

let socket;
let refs = 0;
let wired = false;
const listeners = new Set();
const socketPath = import.meta.env.VITE_SOCKET_PATH || '/api/socket.io';
const SOCKET_AVAILABILITY_TTL_MS = 60_000;
let socketAvailability = null;
let socketAvailabilityCheckedAt = 0;
let socketAvailabilityPromise = null;

function resolveSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  return API_ROOT;
}

function getSocketProbeUrl() {
  if (typeof window === 'undefined') return null;
  const base = resolveSocketUrl();
  const origin = window.location?.origin || '';
  const baseUrl = base && /^https?:\/\//i.test(base) ? base : new URL(base || '/', origin).href;
  const path = socketPath.startsWith('/') ? socketPath : `/${socketPath}`;
  const probeUrl = new URL(path, baseUrl);
  probeUrl.searchParams.set('EIO', '4');
  probeUrl.searchParams.set('transport', 'polling');
  return probeUrl.toString();
}

async function checkSocketAvailability() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    socketAvailability = false;
    socketAvailabilityCheckedAt = Date.now();
    return socketAvailability;
  }
  const now = Date.now();
  if (
    socketAvailability !== null &&
    now - socketAvailabilityCheckedAt < SOCKET_AVAILABILITY_TTL_MS
  ) {
    return socketAvailability;
  }
  if (socketAvailabilityPromise) return socketAvailabilityPromise;
  const probeUrl = getSocketProbeUrl();
  if (!probeUrl) return false;
  socketAvailabilityPromise = fetch(probeUrl, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  })
    .then((response) => response?.ok === true)
    .catch(() => false)
    .then((available) => {
      socketAvailability = available;
      socketAvailabilityCheckedAt = Date.now();
      socketAvailabilityPromise = null;
      return available;
    });
  return socketAvailabilityPromise;
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

async function ensureSocketConnection() {
  if (!socket) return;
  const available = await checkSocketAvailability();
  if (!available) {
    notifyListeners(false);
    return;
  }
  if (!socket.connected) {
    socket.connect();
  }
}

export function connectSocket() {
  if (!socket) {
    const url = resolveSocketUrl();
    socket = io(url, {
      withCredentials: true,
      path: socketPath,
      autoConnect: false,
      transports: ['polling'],
      upgrade: false,
    });
  }
  wireSocketEvents();
  ensureSocketConnection();
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
