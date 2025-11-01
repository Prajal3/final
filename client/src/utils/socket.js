import { io } from 'socket.io-client';

const SOCKET_URL =  'http://localhost:5000';

// Create a single socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
});

// Connection management
let isConnected = false;

export const connectSocket = (userId) => {
  if (!isConnected && userId) {
    socket.connect();
    socket.emit('register', userId);
    isConnected = true;
    console.log('Socket connected for user:', userId);
  }
};

export const disconnectSocket = () => {
  if (isConnected) {
    socket.disconnect();
    isConnected = false;
    console.log('Socket disconnected');
  }
};

export default socket;