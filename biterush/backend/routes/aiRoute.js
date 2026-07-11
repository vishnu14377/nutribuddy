import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getRecommendations, getTrendingItems } from '../services/recommendationService.js';
import { calculateETA } from '../services/etaService.js';
import orderModel from '../models/orderModel.js';
import foodModel from '../models/foodModel.js';
import { AppError } from '../middleware/errorHandler.js';

const aiRouter = express.Router();

// GET /api/ai/recommendations — personalized (requires login)
aiRouter.get('/recommendations', authenticate, async (req, res, next) => {
  try {
    const itemIds = await getRecommendations(req.user.id);
    const items   = await foodModel.find({ _id: { $in: itemIds } });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
});

// GET /api/ai/trending — no auth needed
aiRouter.get('/trending', async (req, res, next) => {
  try {
    const items = await getTrendingItems();
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
});

// GET /api/ai/eta/:orderId
aiRouter.get('/eta/:orderId', authenticate, async (req, res, next) => {
  try {
    const order = await orderModel.findById(req.params.orderId);
    if (!order) throw new AppError("Order not found", 404);

    // Default coordinates (Delhi center) — in production use restaurant/driver coordinates
    const restaurantLoc = { lat: 28.6139, lng: 77.2090 };
    const deliveryLoc   = {
      lat: order.address?.latitude  || 28.6245,
      lng: order.address?.longitude || 77.2167,
    };

    const etaResult = calculateETA(restaurantLoc, deliveryLoc);

    res.json({ success: true, data: { ...etaResult, status: order.status } });
  } catch (error) { next(error); }
});

export default aiRouter;
