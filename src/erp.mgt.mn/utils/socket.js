import { io } from 'socket.io-client';

/**
 * Module-level socket connection shared across hooks.
 * Reference counting ensures the underlying connection
 * is closed only when no consumers remain.
 */
let socket;
let refCount = 0;

export function connectSocket() {
  if (!socket) {
    const url = import.meta.env.VITE_SOCKET_URL || '';
    socket = io(url, { withCredentials: true });
  }
  refCount += 1;
  return socket;
}

export function disconnectSocket() {
  if (refCount > 0) {
    refCount -= 1;
    if (refCount === 0 && socket) {
      socket.disconnect();
      socket = undefined;
    }
  }
}
