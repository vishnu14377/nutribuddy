import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import restaurantModel from "../models/restaurantModel.js";
import deliveryPartnerModel from "../models/deliveryPartnerModel.js";
import { AppError } from "../middleware/errorHandler.js";
import { getIO } from "../socket/socketManager.js";
import { startDeliverySearch } from "../services/assignmentService.js";
import { notifyOrderStatusChange } from "../services/notificationService.js";
import { notifyRestaurant } from "../services/notificationService.js";
import { v4 as uuidv4 } from "uuid";

// POST /api/order/place  (COD)
export const placeOrder = async (req, res, next) => {
  try {
    let { items, amount, address, restaurantId } = req.body;
    if (!items?.length) throw new AppError("Cart is empty", 400);

    // If restaurantId is missing (frontend didn't send it), infer from first item
    if (!restaurantId) {
      const { default: foodModel } = await import("../models/foodModel.js");
      const firstItem = await foodModel.findById(items[0].itemId);
      if (firstItem) restaurantId = firstItem.restaurantId;
    }

    const deliveryCharge = 50;
    const newOrder = new orderModel({
      orderId:       uuidv4(),
      userId:        req.user.id,
      restaurantId:  restaurantId || null,
      items,
      amount,
      deliveryCharge,
      totalAmount:   amount + deliveryCharge,
      address,
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      status:        'Confirmed',
      statusHistory: [{ status: 'Pending' }, { status: 'Confirmed' }],
    });

    await newOrder.save();
    await userModel.findByIdAndUpdate(req.user.id, { cartData: {} });

    // Emit to restaurant
    notifyRestaurant(restaurantId, "New Order Received", `You have a new order #${newOrder.orderId || newOrder._id.slice(-6)}`, 'new_order', { orderId: newOrder._id });
    
    getIO().to(`user_${req.user.id}`).emit('order_confirmed', { orderId: newOrder._id, status: 'Confirmed' });

    res.status(201).json({ success: true, message: "Order Placed", data: newOrder });
  } catch (error) { next(error); }
};

// POST /api/order/place-razorpay  (Razorpay)
export const placeOrderRazorpay = async (req, res, next) => {
  try {
    let { items, amount, address, restaurantId, razorpayOrderId } = req.body;
    if (!items?.length) throw new AppError("Cart is empty", 400);

    // If restaurantId is missing (frontend didn't send it), infer from first item
    if (!restaurantId) {
      const { default: foodModel } = await import("../models/foodModel.js");
      const firstItem = await foodModel.findById(items[0].itemId);
      if (firstItem) restaurantId = firstItem.restaurantId;
    }

    const deliveryCharge = 50;
    const newOrder = new orderModel({
      orderId:        uuidv4(),
      userId:         req.user.id,
      restaurantId:   restaurantId || null,
      items,
      amount,
      deliveryCharge,
      totalAmount:    amount + deliveryCharge,
      address,
      paymentMethod:  'razorpay',
      paymentStatus:  'pending',
      razorpayOrderId: razorpayOrderId || '',
      status:         'Pending',
      statusHistory:  [{ status: 'Pending' }],
    });

    await newOrder.save();

    // Trigger notification for restaurant (Pending status)
    notifyRestaurant(restaurantId, "Potential New Order", `Incoming order #${newOrder.orderId || newOrder._id.slice(-6)} awaiting payment`, 'new_order', { orderId: newOrder._id });

    res.status(201).json({ success: true, message: "Order created, awaiting payment", data: newOrder });
  } catch (error) { next(error); }
};

// GET /api/order/list  (admin/owner)
export const listOrders = async (req, res, next) => {
  try {
    const { status, restaurantId, page = 1, limit = 20 } = req.query;
    
    // Filtering logic for multi-portal
    const filter = {};
    if (status) filter.status = status;
    
    if (req.user.role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (!rest) return res.json({ success: true, data: [], total: 0 });
      filter.restaurantId = rest._id;
    } else if (restaurantId) {
      filter.restaurantId = restaurantId;
    }

    const orders = await orderModel.find(filter)
      .populate('userId', 'name email phone')
      .populate({ path: 'assignedDriver', populate: { path: 'userId', select: 'name phone' } })
      .populate('restaurantId', 'name address phone location')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
      
    const total = await orderModel.countDocuments(filter);
    res.json({ success: true, data: orders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
};

// GET /api/order/driver-tasks  (delivery_partner)
export const listDriverTasks = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id });
    if (!partner) throw new AppError("Driver profile not found", 404);

    const orders = await orderModel.find({ assignedDriver: partner._id })
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name address phone')
      .sort('-createdAt');
      
    res.json({ success: true, data: orders });
  } catch (error) { next(error); }
};

// POST /api/order/userorders  (user - own orders)
export const userOrders = async (req, res, next) => {
  try {
    const orders = await orderModel.find({ userId: req.user.id })
      .populate('restaurantId', 'name address phone')
      .sort('-createdAt');
    res.json({ success: true, data: orders });
  } catch (error) { next(error); }
};

// POST /api/order/status  (admin/owner)
export const updateStatus = async (req, res, next) => {
  try {
    const { orderId, status } = req.body;
    const order = await orderModel.findById(orderId);
    if (!order) throw new AppError("Order not found", 404);

    // Authorization check for owners
    if (req.user.role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (!order.restaurantId || order.restaurantId.toString() !== rest?._id.toString()) {
        throw new AppError("Not authorized to update this order", 403);
      }
    }

    order.status = status;
    order.statusHistory.push({ status, timestamp: new Date() });
    await order.save();

    const io = getIO();
    io.to(`user_${order.userId}`).emit('order_status_update', { orderId, status });
    if (order.restaurantId) io.to(`restaurant_${order.restaurantId}`).emit('order_status_update', { orderId, status });
    io.to('admin').emit('order_status_update', { orderId, status });
    if (order.assignedDriver) {
      io.to(`driver_${order.assignedDriver}`).emit('order_status_update', { orderId, status });
    }

    notifyOrderStatusChange(order, status);

    if (status === 'Ready' && !order.assignedDriver) {
      startDeliverySearch(order._id).catch(() => {});
    }

    res.json({ success: true, message: "Status Updated" });
  } catch (error) { next(error); }
};

// POST /api/order/verify  (legacy)
export const verifyOrder = async (req, res, next) => {
  const { orderId, success } = req.body;
  try {
    if (success === "true") {
      const order = await orderModel.findByIdAndUpdate(orderId, {
        paymentStatus: 'paid',
        status: 'Confirmed',
        $push: { statusHistory: { status: 'Confirmed' } }
      }, { new: true });
      await userModel.findByIdAndUpdate(order.userId, { cartData: {} });

      const io = getIO();
      io.to(`user_${order.userId}`).emit('payment_success', { orderId });
      res.json({ success: true, message: "Payment verified" });
    } else {
      await orderModel.findByIdAndDelete(orderId);
      res.json({ success: false, message: "Payment failed" });
    }
  } catch (error) { next(error); }
};

// PATCH /api/order/:id/cancel  (user/admin/owner)
export const cancelOrder = async (req, res, next) => {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) throw new AppError("Order not found", 404);
    
    // Auth check
    if (req.user.role === 'user' && order.userId.toString() !== req.user.id) {
       throw new AppError("Not authorized", 403);
    }
    if (req.user.role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (order.restaurantId.toString() !== rest?._id.toString()) throw new AppError("Not authorized", 403);
    }

    if (['Delivered', 'Cancelled'].includes(order.status)) {
      throw new AppError("Cannot cancel this order", 400);
    }
    order.status = 'Cancelled';
    order.statusHistory.push({ status: 'Cancelled', timestamp: new Date() });
    await order.save();

    const io = getIO();
    io.to(`user_${order.userId}`).emit('order_cancelled', { orderId: order._id });
    if (order.restaurantId) io.to(`restaurant_${order.restaurantId}`).emit('order_cancelled', { orderId: order._id });

    res.json({ success: true, message: "Order cancelled" });
  } catch (error) { next(error); }
};

// GET /api/order/:id  (order details)
export const getOrderById = async (req, res, next) => {
  try {
    const order = await orderModel.findById(req.params.id)
      .populate('userId', 'name email phone')
      .populate({ path: 'assignedDriver', populate: { path: 'userId', select: 'name phone' } })
      .populate('restaurantId', 'name address phone location');
    if (!order) throw new AppError("Order not found", 404);

    if (req.user.role === 'user' && order.userId?._id.toString() !== req.user.id) {
      throw new AppError("Not authorized", 403);
    }

    if (req.user.role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (!rest || order.restaurantId?._id?.toString() !== rest._id.toString()) {
        throw new AppError("Not authorized", 403);
      }
    }

    if (req.user.role === 'delivery_partner') {
      const partner = await deliveryPartnerModel.findOne({ userId: req.user.id });
      if (!partner || order.assignedDriver?._id?.toString() !== partner._id.toString()) {
        throw new AppError("Not authorized", 403);
      }
    }

    res.json({ success: true, data: order });
  } catch (error) { next(error); }
};

// Stats for admin/owner dashboard
export const getOrderStats = async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const filter = {};
    
    if (req.user.role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (!rest) return res.json({ success: true, data: { total: 0, todayCount: 0, pending: 0, delivered: 0, revenue: 0 } });
      filter.restaurantId = rest._id;
    }

    const [total, todayCount, pending, delivered, revenue] = await Promise.all([
      orderModel.countDocuments(filter),
      orderModel.countDocuments({ ...filter, createdAt: { $gte: today } }),
      orderModel.countDocuments({ ...filter, status: { $in: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery'] } }),
      orderModel.countDocuments({ ...filter, status: 'Delivered' }),
      orderModel.aggregate([
        { $match: { ...filter, paymentStatus: 'paid' } }, 
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
    ]);
    res.json({ success: true, data: { total, todayCount, pending, delivered, revenue: revenue[0]?.total || 0 } });
  } catch (error) { next(error); }
};
