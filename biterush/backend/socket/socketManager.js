import notificationModel from "../models/notificationModel.js";
import { logger } from "../middleware/logger.js";

let _io = null;

export const initSocket = (io) => {
  _io = io;

  io.on('connection', (socket) => {
    const { userId, role, restaurantId, driverId } = socket.handshake.auth;

    // Join personal rooms
    if (role === 'admin') socket.join('admin');
    if (userId)       socket.join(`user_${userId}`);
    if (restaurantId) socket.join(`restaurant_${restaurantId}`);
    if (driverId)     socket.join(`driver_${driverId}`);
    
    // Join role-based broadcast rooms
    if (role === 'admin') socket.join('admin');

    // Customer: join order tracking room
    socket.on('track_order', ({ orderId }) => {
      socket.join(`order_${orderId}`);
    });

    socket.on('leave_order', ({ orderId }) => {
      socket.leave(`order_${orderId}`);
    });

    // Driver location broadcast
    socket.on('driver_location_update', async ({ latitude, longitude, orderId }) => {
      if (orderId) {
        io.to(`order_${orderId}`).emit('driver_location', { latitude, longitude, orderId });
      }
    });

    // Notification read
    socket.on('mark_notification_read', async ({ notificationId }) => {
      try {
        const notif = await notificationModel.findByIdAndUpdate(notificationId, { isRead: true }, { new: true });
        if (notif) {
          socket.emit('notification_marked_read', { notificationId });
        }
      } catch (err) {
        logger.error(`Error marking notification read: ${err.message}`);
      }
    });

    socket.on('disconnect', () => {
      // Cleanup handled by model isOnline flag via API
    });
  });
};

export const getIO = () => {
  if (!_io) {
    // Return a dummy object that silently fails if socket not yet initialized
    return { to: () => ({ emit: () => {} }), emit: () => {} };
  }
  return _io;
};

// Helpers to emit events from anywhere
export const emitToUser = (userId, event, data) => getIO().to(`user_${userId}`).emit(event, data);
export const emitToRestaurant = (restaurantId, event, data) => getIO().to(`restaurant_${restaurantId}`).emit(event, data);
export const emitToDriver = (driverId, event, data) => getIO().to(`driver_${driverId}`).emit(event, data);
export const emitToOrder = (orderId, event, data) => getIO().to(`order_${orderId}`).emit(event, data);
export const emitToAdmins = (event, data) => getIO().to('admin').emit(event, data);
