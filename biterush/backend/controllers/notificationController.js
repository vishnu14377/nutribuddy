import notificationModel from "../models/notificationModel.js";
import { AppError } from "../middleware/errorHandler.js";

// GET /api/notifications
export const getMyNotifications = async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    
    let filter = {};
    if (role === 'admin') {
      filter = { recipientType: 'admin' };
    } else if (role === 'restaurant_owner') {
      const { default: restaurantModel } = await import("../models/restaurantModel.js");
      const rest = await restaurantModel.findOne({ ownerId: userId });
      if (rest) {
        filter = { recipientType: 'restaurant_owner', recipientId: rest._id };
      } else {
        filter = { _id: null }; // No restaurant, no notifications
      }
    } else if (role === 'delivery_partner') {
      const { default: deliveryPartnerModel } = await import("../models/deliveryPartnerModel.js");
      const partner = await deliveryPartnerModel.findOne({ userId });
      if (partner) {
        filter = { recipientType: 'delivery_partner', recipientId: partner._id };
      } else {
        filter = { _id: null };
      }
    } else {
      filter = { recipientType: 'user', recipientId: userId };
    }

    const notifications = await notificationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: notifications });
  } catch (error) { next(error); }
};

// PATCH /api/notifications/:id/read
export const markAsRead = async (req, res, next) => {
  try {
    const notif = await notificationModel.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!notif) throw new AppError("Notification not found", 404);
    res.json({ success: true, data: notif });
  } catch (error) { next(error); }
};

// PATCH /api/notifications/read-all
export const markAllAsRead = async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    
    let filter = {};
    if (role === 'admin') {
      filter = { recipientType: 'admin' };
    } else if (role === 'delivery_partner') {
      const { default: deliveryPartnerModel } = await import("../models/deliveryPartnerModel.js");
      const partner = await deliveryPartnerModel.findOne({ userId });
      filter = partner ? { recipientType: 'delivery_partner', recipientId: partner._id } : { _id: null };
    } else {
      filter = { recipientId: userId };
    }

    await notificationModel.updateMany({ ...filter, isRead: false }, { isRead: true });
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) { next(error); }
};
