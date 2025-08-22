import { io } from 'socket.io-client';

export function connectSocket() {
  const url = import.meta.env.VITE_SOCKET_URL || '';
  return io(url, { withCredentials: true });
}
