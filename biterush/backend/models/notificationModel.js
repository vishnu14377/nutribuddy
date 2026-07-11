import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: false }, // null for broadcast to all admins
  recipientType: { 
    type: String, 
    enum: ['admin', 'restaurant_owner', 'user', 'delivery_partner'], 
    required: true 
  },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

// Index for better query performance
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ recipientType: 1, isRead: 1 });

const notificationModel = mongoose.models.notification || mongoose.model("notification", notificationSchema);
export default notificationModel;
