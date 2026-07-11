import Razorpay from "razorpay";
import crypto from "crypto";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import { AppError } from "../middleware/errorHandler.js";
import { getIO } from "../socket/socketManager.js";

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new AppError("Razorpay is not configured. Please contact support.", 503);
  }
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// POST /api/payment/razorpay/create-order
export const createRazorpayOrder = async (req, res, next) => {
  try {
    const { amount } = req.body; // amount in ₹
    if (!amount || amount <= 0) throw new AppError("Invalid amount", 400);

    const razorpay = getRazorpayInstance();
    const options = {
      amount:   Math.round(amount * 100), // convert to paise
      currency: 'INR',
      receipt:  `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency } });
  } catch (error) { next(error); }
};

// POST /api/payment/razorpay/verify
export const verifyRazorpayPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Idempotency — check if this payment already processed
    const alreadyProcessed = await orderModel.findOne({ paymentId: razorpay_payment_id });
    if (alreadyProcessed) {
      return res.json({ success: true, message: "Payment already processed", data: alreadyProcessed });
    }

    // Verify HMAC signature
    const body        = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');

    if (expectedSig !== razorpay_signature) {
      throw new AppError("Payment signature mismatch. Possible fraud.", 400);
    }

    const order = await orderModel.findByIdAndUpdate(orderId, {
      paymentStatus:  'paid',
      paymentId:      razorpay_payment_id,
      status:         'Confirmed',
      $push: { statusHistory: { status: 'Confirmed', notes: `Paid via Razorpay: ${razorpay_payment_id}` } }
    }, { new: true });

    if (!order) throw new AppError("Order not found", 404);

    await userModel.findByIdAndUpdate(order.userId, { cartData: {} });

    const io = getIO();
    io.to(`user_${order.userId}`).emit('payment_success', { orderId: order._id });
    io.to(`user_${order.userId}`).emit('order_confirmed', { orderId: order._id, status: 'Confirmed' });
    if (order.restaurantId) {
      io.to(`restaurant_${order.restaurantId}`).emit('new_order', { order });
    }

    res.json({ success: true, message: "Payment verified and order confirmed", data: order });
  } catch (error) { next(error); }
};

// GET /api/payment/razorpay/key  (send public key to frontend)
export const getRazorpayKey = async (req, res, next) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID) {
      throw new AppError("Razorpay not configured", 503);
    }
    res.json({ success: true, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) { next(error); }
};
