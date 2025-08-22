import { io } from 'socket.io-client';

/**
 * Shared socket.io instance with reference counting.
 * Hooks call {@link socket.acquire} and {@link socket.release}
 * to manage the underlying connection.
 */
const url = import.meta.env.VITE_SOCKET_URL || '';
const socket = io(url, { withCredentials: true, autoConnect: false });

let refCount = 0;

socket.acquire = () => {
  refCount += 1;
  if (!socket.connected) socket.connect();
  return socket;
};

socket.release = () => {
  if (refCount > 0) {
    refCount -= 1;
    if (refCount === 0) socket.disconnect();
  }
};

export default socket;

