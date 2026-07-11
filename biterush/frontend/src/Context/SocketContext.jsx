import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-toastify';

const SocketContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const SocketProvider = ({ children, userId, restaurantId, driverId }) => {
  const socketRef  = useRef(null);
  const [isConnected, setIsConnected]   = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth:       { userId, restaurantId, driverId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect',    () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Global notification listener
    socket.on('notification', (notification) => {
      setNotifications(prev => [notification, ...prev].slice(0, 50)); // max 50
      if (notification?.title || notification?.message) {
        toast.info(notification.title ? `${notification.title}: ${notification.message}` : notification.message);
      }
    });

    return () => { socket.disconnect(); };
  }, [userId, restaurantId, driverId]);

  const trackOrder = (orderId) => socketRef.current?.emit('track_order', { orderId });
  const leaveOrder = (orderId) => socketRef.current?.emit('leave_order', { orderId });

  const markAllRead = () =>
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      notifications,
      unreadCount,
      trackOrder,
      leaveOrder,
      markAllRead,
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
export default SocketContext;
