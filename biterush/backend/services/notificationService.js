import { getIO } from "../socket/socketManager.js";
import { logger } from "../middleware/logger.js";
import notificationModel from "../models/notificationModel.js";

/**
 * In-app notification service using Socket.io and MongoDB
 */

export const NotificationTypes = {
  ORDER_PLACED:      'order_placed',
  ORDER_CONFIRMED:   'order_confirmed',
  ORDER_PREPARING:   'order_preparing',
  ORDER_READY:       'order_ready',
  OUT_FOR_DELIVERY:  'out_for_delivery',
  ORDER_DELIVERED:   'order_delivered',
  ORDER_CANCELLED:   'order_cancelled',
  DRIVER_ASSIGNED:   'driver_assigned',
  PAYMENT_SUCCESS:   'payment_success',
  PAYMENT_FAILED:    'payment_failed',
  NEW_ORDER:         'new_order',           // for restaurant
  NEW_VENDOR:        'new_vendor',          // for admin
  NEW_DELIVERY:      'new_delivery',        // for admin
  OFFER:             'offer',
};

/**
 * Send persistent notification to a specific recipient
 */
export const notifyRecipient = async (recipientId, recipientType, title, message, type, payload = {}) => {
  try {
    const notification = new notificationModel({
      recipientId,
      recipientType,
      title,
      message,
      type,
      payload
    });
    await notification.save();

    let room;
    if (recipientType === 'admin') room = 'admin';
    else if (recipientType === 'restaurant_owner') room = `restaurant_${recipientId}`;
    else room = `${recipientType}_${recipientId}`;
    
    getIO().to(room).emit('notification', notification);
    
    logger.debug(`Notification sent to ${room}: ${type}`);
    return notification;
  } catch (err) {
    logger.error(`Failed to notify ${recipientType} ${recipientId}: ${err.message}`);
  }
};

/**
 * Specialized helpers using the base notifyRecipient
 */
export const notifyUser = (userId, title, message, type, payload = {}) => 
  notifyRecipient(userId, 'user', title, message, type, payload);

export const notifyRestaurant = (restaurantId, title, message, type, payload = {}) => 
  notifyRecipient(restaurantId, 'restaurant_owner', title, message, type, payload);

export const notifyAdmins = (title, message, type, payload = {}) => 
  notifyRecipient(null, 'admin', title, message, type, payload);

/**
 * Notify all parties on order status change
 */
export const notifyOrderStatusChange = (order, status) => {
  const messages = {
    'Confirmed':       '✅ Your order has been confirmed!',
    'Preparing':       '👨‍🍳 Your food is being prepared',
    'Ready':           '📦 Your order is ready for pickup',
    'Out for Delivery':'🚴 Your order is on the way!',
    'Delivered':       '🎉 Your order has been delivered. Enjoy!',
    'Cancelled':       '❌ Your order has been cancelled',
  };

  notifyUser(order.userId, 'Order Status Updated', messages[status] || `Order status: ${status}`, `order_${status.toLowerCase().replace(/ /g, '_')}`, {
    orderId:  order._id,
    status,
  });

  if (order.restaurantId) {
    notifyRestaurant(order.restaurantId, 'Order Update', `Order status changed to ${status}`, 'order_status_changed', { orderId: order._id, status });
  }
};
