import { io } from 'socket.io-client';

let socket;
let refs = 0;

export function connectSocket() {
  if (!socket) {
    const url = import.meta.env.VITE_SOCKET_URL || '';
    socket = io(url, { withCredentials: true });
  }
  refs += 1;
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
