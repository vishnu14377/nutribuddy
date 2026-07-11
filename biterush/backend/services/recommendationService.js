import orderModel from "../models/orderModel.js";
import { logger } from "../middleware/logger.js";

/**
 * Get personalized food recommendations for a user
 * Strategy: Find food items ordered most by similar users (collaborative filtering)
 */
export const getRecommendations = async (userId) => {
  try {
    // Get the user's past ordered item IDs
    const userOrders = await orderModel.find({ userId }).select('items').limit(20);
    const orderedItemIds = new Set();
    userOrders.forEach(o => o.items.forEach(i => orderedItemIds.add(i.itemId)));

    // Find other users who ordered similar items
    const similarOrders = await orderModel.find({
      userId:    { $ne: userId },
      'items.itemId': { $in: [...orderedItemIds] },
    }).select('items').limit(50);

    // Count frequency of items ordered by similar users
    const itemFrequency = {};
    similarOrders.forEach(order => {
      order.items.forEach(item => {
        if (!orderedItemIds.has(item.itemId)) {
          itemFrequency[item.itemId] = (itemFrequency[item.itemId] || 0) + 1;
        }
      });
    });

    // Sort by frequency and return top 5
    const recommended = Object.entries(itemFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([itemId]) => itemId);

    return recommended;
  } catch (err) {
    logger.error(`Recommendation error: ${err.message}`);
    return [];
  }
};

/**
 * Get trending items (most ordered in last 24 hours)
 */
export const getTrendingItems = async () => {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await orderModel.aggregate([
      { $match: { createdAt: { $gte: yesterday } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.itemId', count: { $sum: '$items.quantity' }, name: { $first: '$items.name' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    return result;
  } catch (err) {
    logger.error(`Trending items error: ${err.message}`);
    return [];
  }
};
