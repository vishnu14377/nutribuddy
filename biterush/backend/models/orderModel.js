import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  orderId:       { type: String, unique: true, sparse: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  restaurantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'restaurant', default: null },
  items: [{
    itemId:   { type: String, required: true },
    name:     { type: String, required: true },
    price:    { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    image:    { type: String, default: '' },
  }],
  amount:        { type: Number, required: true },
  deliveryCharge:{ type: Number, default: 50 },
  totalAmount:   { type: Number, required: true },
  address:       { type: Object, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'],
    default: 'Pending',
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'razorpay', 'cod'],
    default: 'cod',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  paymentId:       { type: String, default: '' },    // Idempotency key
  razorpayOrderId: { type: String, default: '' },
  assignedDriver:  { type: mongoose.Schema.Types.ObjectId, ref: 'deliverypartner', default: null },
  offeredDrivers: [{
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'deliverypartner', required: true },
    distanceKm: { type: Number, default: null },
    notifiedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
  }],
  deliverySearchStartedAt: { type: Date, default: null },
  estimatedDeliveryTime: { type: Number, default: 45 }, // minutes
  statusHistory: [{
    status:    String,
    timestamp: { type: Date, default: Date.now },
    notes:     String,
  }],
}, { timestamps: true });

orderSchema.index({ userId: 1 });
orderSchema.index({ restaurantId: 1 });
orderSchema.index({ paymentId: 1 });
orderSchema.index({ status: 1 });

const orderModel = mongoose.models.order || mongoose.model("order", orderSchema);
export default orderModel;
