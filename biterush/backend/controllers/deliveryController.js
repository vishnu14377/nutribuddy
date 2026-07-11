import deliveryPartnerModel from "../models/deliveryPartnerModel.js";
import orderModel from "../models/orderModel.js";
import { AppError } from "../middleware/errorHandler.js";
import { getIO } from "../socket/socketManager.js";
import { notifyRecipient, NotificationTypes, notifyUser, notifyRestaurant, notifyAdmins, notifyOrderStatusChange } from "../services/notificationService.js";

// GET /api/delivery/profile
export const getPartnerProfile = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id }).populate('userId', 'name email phone');
    if (!partner) throw new AppError("Delivery partner profile not found", 404);
    res.json({ success: true, data: partner });
  } catch (error) { next(error); }
};

// POST /api/delivery/register
export const registerPartner = async (req, res, next) => {
  try {
    const exists = await deliveryPartnerModel.findOne({ userId: req.user.id });
    if (exists) throw new AppError("Partner profile already exists", 409);

    const partner = new deliveryPartnerModel({
      userId:        req.user.id,
      vehicleType:   req.body.vehicleType || 'bike',
      vehicleNumber: req.body.vehicleNumber || '',
    });
    await partner.save();

    // Notify admins
    notifyAdmins("New Delivery Partner", `A new delivery partner profile has been created`, 'new_delivery', { partnerId: partner._id });

    res.status(201).json({ success: true, data: partner, message: 'Partner profile created' });
  } catch (error) { next(error); }
};

// PATCH /api/delivery/toggle-online
export const toggleOnlineStatus = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id });
    if (!partner) throw new AppError("Partner not found", 404);
    partner.isOnline = !partner.isOnline;
    if (!partner.isOnline) partner.isAvailable = false;
    else partner.isAvailable = true;
    await partner.save();
    res.json({ success: true, message: `You are now ${partner.isOnline ? 'online' : 'offline'}`, isOnline: partner.isOnline });
  } catch (error) { next(error); }
};

// POST /api/delivery/update-location
export const updateLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) throw new AppError("Location coordinates required", 400);

    const partner = await deliveryPartnerModel.findOneAndUpdate(
      { userId: req.user.id },
      { currentLocation: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] } },
      { new: true }
    );

    // Emit location to customer, restaurant, and admin while this order is active
    if (partner?.currentOrderId) {
      const order = await orderModel.findById(partner.currentOrderId);
      if (order) {
        const io = getIO();
        io.to(`order_${order._id}`).emit('driver_location', { latitude, longitude, orderId: order._id });
        if (order.restaurantId) io.to(`restaurant_${order.restaurantId}`).emit('driver_location', { latitude, longitude, orderId: order._id });
        io.to('admin').emit('driver_location', { latitude, longitude, orderId: order._id });
      }
    }

    res.json({ success: true, message: 'Location updated' });
  } catch (error) { next(error); }
};

// GET /api/delivery/current-order
export const getCurrentOrder = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id });
    if (!partner) throw new AppError("Partner not found", 404);
    if (!partner.currentOrderId) return res.json({ success: true, data: null, message: 'No active order' });

    const order = await orderModel.findById(partner.currentOrderId)
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name address phone')
      .populate({ path: 'assignedDriver', populate: { path: 'userId', select: 'name phone' } });
    res.json({ success: true, data: order });
  } catch (error) { next(error); }
};

// GET /api/delivery/offers
export const getDeliveryOffers = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id }).populate('userId', 'name phone');
    if (!partner) throw new AppError("Partner not found", 404);

    const offers = await orderModel.find({
      status: 'Ready',
      assignedDriver: null,
      'offeredDrivers.driverId': partner._id,
    })
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name address phone')
      .sort('-deliverySearchStartedAt');

    res.json({ success: true, data: offers });
  } catch (error) { next(error); }
};

// PATCH /api/delivery/accept-order/:orderId
export const acceptOrder = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id }).populate('userId', 'name phone');
    if (!partner) throw new AppError("Partner not found", 404);

    let order = await orderModel.findById(req.params.orderId)
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name address phone');
    if (!order) throw new AppError("Order not found", 404);
    if (order.assignedDriver) {
      throw new AppError("This delivery has already been accepted", 409);
    }
    if (order.status !== 'Ready') {
      throw new AppError("This order is not ready for delivery pickup", 400);
    }
    if (!order.offeredDrivers?.some((offer) => offer.driverId.toString() === partner._id.toString())) {
      throw new AppError("This order was not offered to you", 403);
    }

    partner.isAvailable = false;
    partner.currentOrderId = order._id;
    await partner.save();

    const acceptedAt = new Date();
    const offeredDrivers = (order.offeredDrivers || []).map((offer) => ({
      ...offer.toObject(),
      acceptedAt: offer.driverId.toString() === partner._id.toString() ? acceptedAt : offer.acceptedAt,
    }));

    const updated = await orderModel.findOneAndUpdate(
      { _id: order._id, assignedDriver: null, status: 'Ready' },
      {
        assignedDriver: partner._id,
        status: 'Out for Delivery',
        offeredDrivers,
        $push: { statusHistory: { status: 'Out for Delivery', notes: 'Driver accepted delivery offer' } },
      },
      { new: true }
    )
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name address phone');

    if (!updated) {
      partner.isAvailable = true;
      partner.currentOrderId = null;
      await partner.save();
      throw new AppError("This delivery has already been accepted by another driver", 409);
    }
    order = updated;

    const userRoomId = order.userId._id || order.userId;
    const io = getIO();
    io.to(`user_${userRoomId}`).emit('order_status_update', { orderId: order._id, status: 'Out for Delivery' });
    if (order.restaurantId) io.to(`restaurant_${order.restaurantId._id || order.restaurantId}`).emit('order_status_update', { orderId: order._id, status: 'Out for Delivery' });
    io.to('admin').emit('order_status_update', { orderId: order._id, status: 'Out for Delivery' });
    io.to(`driver_${partner._id}`).emit('order_accepted', { order });

    const driverDetails = {
      id: partner._id,
      name: partner.userId?.name || 'Delivery Partner',
      phone: partner.userId?.phone || '',
      vehicleType: partner.vehicleType,
      vehicleNumber: partner.vehicleNumber,
      location: {
        latitude: partner.currentLocation?.coordinates?.[1] || null,
        longitude: partner.currentLocation?.coordinates?.[0] || null,
      },
    };

    io.to(`user_${userRoomId}`).emit('driver_assigned', {
      orderId: order._id,
      driver: driverDetails,
    });

    await notifyUser(
      userRoomId,
      'Driver assigned',
      `${driverDetails.name} is coming to pick up and deliver your order.`,
      NotificationTypes.DRIVER_ASSIGNED,
      { orderId: order._id, driver: driverDetails }
    );

    if (order.restaurantId) {
      await notifyRestaurant(
        order.restaurantId._id || order.restaurantId,
        'Delivery partner assigned',
        `${driverDetails.name} accepted order #${order.orderId || order._id.toString().slice(-6).toUpperCase()}.`,
        NotificationTypes.DRIVER_ASSIGNED,
        { orderId: order._id, driver: driverDetails }
      );
    }

    await notifyAdmins(
      'Delivery partner assigned',
      `${driverDetails.name} accepted order #${order.orderId || order._id.toString().slice(-6).toUpperCase()}.`,
      NotificationTypes.DRIVER_ASSIGNED,
      { orderId: order._id, driver: driverDetails }
    );

    await Promise.all(
      (order.offeredDrivers || [])
        .filter((offer) => offer.driverId.toString() !== partner._id.toString())
        .map((offer) =>
          notifyRecipient(
            offer.driverId,
            'delivery_partner',
            'Delivery offer closed',
            `Order #${order.orderId || order._id.toString().slice(-6).toUpperCase()} was accepted by another delivery partner.`,
            NotificationTypes.NEW_DELIVERY,
            { orderId: order._id, closed: true }
          )
        )
    );

    res.json({ success: true, message: 'Order accepted', data: order });
  } catch (error) { next(error); }
};

// PATCH /api/delivery/mark-delivered/:orderId
export const markDelivered = async (req, res, next) => {
  try {
    const partner = await deliveryPartnerModel.findOne({ userId: req.user.id });
    const order = await orderModel.findById(req.params.orderId).populate('restaurantId', 'name');
    if (!order || !partner) throw new AppError("Not found", 404);

    order.status = 'Delivered';
    order.statusHistory.push({ status: 'Delivered', timestamp: new Date() });
    await order.save();

    partner.isAvailable = true;
    partner.currentOrderId = null;
    partner.totalDeliveries += 1;
    partner.earningsToday += 30; // ₹30 per delivery
    partner.earningsTotal += 30;
    await partner.save();

    const io = getIO();
    io.to(`user_${order.userId._id || order.userId}`).emit('order_delivered', { orderId: order._id });
    io.to(`user_${order.userId._id || order.userId}`).emit('order_status_update', { orderId: order._id, status: 'Delivered' });
    if (order.restaurantId) io.to(`restaurant_${order.restaurantId._id || order.restaurantId}`).emit('order_status_update', { orderId: order._id, status: 'Delivered' });
    io.to('admin').emit('order_status_update', { orderId: order._id, status: 'Delivered' });
    io.to(`order_${order._id}`).emit('order_delivered', { orderId: order._id });

    notifyOrderStatusChange(order, 'Delivered');
    if (order.restaurantId) {
      await notifyRestaurant(
        order.restaurantId._id || order.restaurantId,
        'Order delivered',
        `Order #${order.orderId || order._id.toString().slice(-6).toUpperCase()} was delivered.`,
        NotificationTypes.ORDER_DELIVERED,
        { orderId: order._id }
      );
    }
    await notifyAdmins(
      'Order delivered',
      `Order #${order.orderId || order._id.toString().slice(-6).toUpperCase()} was delivered.`,
      NotificationTypes.ORDER_DELIVERED,
      { orderId: order._id }
    );

    res.json({ success: true, message: 'Order marked delivered' });
  } catch (error) { next(error); }
};

// GET /api/delivery/all  (admin)
export const getAllPartners = async (req, res, next) => {
  try {
    const partners = await deliveryPartnerModel.find().populate('userId', 'name email phone').sort('-createdAt');
    res.json({ success: true, data: partners, count: partners.length });
  } catch (error) { next(error); }
};
