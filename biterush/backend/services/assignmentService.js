import deliveryPartnerModel from "../models/deliveryPartnerModel.js";
import orderModel from "../models/orderModel.js";
import restaurantModel from "../models/restaurantModel.js";
import { getIO } from "../socket/socketManager.js";
import { logger } from "../middleware/logger.js";
import { NotificationTypes, notifyRecipient, notifyUser } from "./notificationService.js";

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { latitude: lat, longitude: lon };
};

const getRestaurantLocation = async (restaurantId) => {
  if (!restaurantId) return null;
  const restaurant = await restaurantModel.findById(restaurantId).select("name address location");
  if (!restaurant) return null;
  const coords = restaurant.location?.coordinates || [];
  const location = normalizeCoordinates(coords[1], coords[0]);
  if (!location) return null;
  return { restaurant, ...location };
};

export const findNearestDeliveryPartner = async ({ latitude, longitude, maxDistanceKm = null, limit = 10 }) => {
  const targetLocation = normalizeCoordinates(latitude, longitude);
  if (!targetLocation) return [];

  const partners = await deliveryPartnerModel.find({
    isOnline: true,
    isAvailable: true,
    currentOrderId: null,
  }).populate("userId", "name phone");

  const rankedPartners = partners
    .map((partner) => {
      const [pLon, pLat] = partner.currentLocation.coordinates;
      const partnerLocation = normalizeCoordinates(pLat, pLon);
      if (!partnerLocation) return null;
      const distanceKm = haversineDistance(
        targetLocation.latitude,
        targetLocation.longitude,
        partnerLocation.latitude,
        partnerLocation.longitude
      );
      return { partner, distanceKm };
    })
    .filter(Boolean)
    .filter(({ distanceKm }) => maxDistanceKm == null || distanceKm <= maxDistanceKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return rankedPartners;
};

export const startDeliverySearch = async (orderId) => {
  try {
    const order = await orderModel.findById(orderId).populate("userId", "name phone");
    if (!order || order.assignedDriver) return null;
    if (order.status !== "Ready") return null;

    const restaurantLocation = await getRestaurantLocation(order.restaurantId);
    let nearbyPartners = [];

    if (restaurantLocation) {
      nearbyPartners = await findNearestDeliveryPartner({
        latitude: restaurantLocation.latitude,
        longitude: restaurantLocation.longitude,
        maxDistanceKm: 10,
        limit: 8,
      });
    }

    if (!nearbyPartners.length) {
      const fallbackPartners = await deliveryPartnerModel.find({
        isOnline: true,
        isAvailable: true,
        currentOrderId: null,
      })
        .populate("userId", "name phone")
        .sort({ updatedAt: -1 })
        .limit(8);

      nearbyPartners = fallbackPartners.map((partner) => ({ partner, distanceKm: null }));
    }

    if (!nearbyPartners.length) {
      logger.warn(`No available drivers for order ${orderId}`);
      return [];
    }

    order.offeredDrivers = nearbyPartners.map(({ partner, distanceKm }) => ({
      driverId: partner._id,
      distanceKm,
      notifiedAt: new Date(),
      acceptedAt: null,
    }));
    order.deliverySearchStartedAt = new Date();
    await order.save();

    const io = getIO();

    await Promise.all(nearbyPartners.map(async ({ partner, distanceKm }) => {
      const payload = {
        orderId: order._id,
        orderCode: order.orderId,
        restaurantName: restaurantLocation?.restaurant?.name || "Restaurant",
        restaurantAddress: restaurantLocation?.restaurant?.address || {},
        customerName: `${order.address?.firstName || ''} ${order.address?.lastName || ''}`.trim(),
        deliveryAddress: order.address,
        itemCount: order.items?.length || 0,
        totalAmount: order.totalAmount,
        distanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null,
      };

      io.to(`driver_${partner._id}`).emit("delivery_offer", payload);
      await notifyRecipient(
        partner._id,
        "delivery_partner",
        "New nearby delivery",
        `${payload.restaurantName} has an order ready for pickup${distanceKm != null ? ` ${distanceKm.toFixed(1)} km away` : ''}.`,
        NotificationTypes.NEW_DELIVERY,
        payload
      );
    }));

    await notifyUser(
      order.userId._id || order.userId,
      "Restaurant is ready",
      `${restaurantLocation?.restaurant?.name || 'Your restaurant'} has prepared your order and delivery partners are being notified.`,
      NotificationTypes.ORDER_READY,
      { orderId: order._id, restaurantName: restaurantLocation?.restaurant?.name || 'Restaurant' }
    );

    logger.info(`Delivery search started for order ${orderId}; notified ${nearbyPartners.length} nearby drivers`);
    return nearbyPartners;
  } catch (err) {
    logger.error(`Delivery search error: ${err.message}`);
    return null;
  }
};
