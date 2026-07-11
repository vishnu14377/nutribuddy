import foodModel from "../models/foodModel.js";
import restaurantModel from "../models/restaurantModel.js";
import { AppError } from "../middleware/errorHandler.js";

// GET /api/search?q=pizza&category=Italian&maxPrice=300&minRating=4
export const search = async (req, res, next) => {
  try {
    const { q, category, cuisineType, maxPrice, minPrice, minRating, type = 'all' } = req.query;

    const results = { food: [], restaurants: [] };

    if (!q && !category) throw new AppError("Search query or category required", 400);

    // Search food items
    if (type === 'all' || type === 'food') {
      const foodFilter = { isAvailable: true };
      if (q) foodFilter.$text = { $search: q };
      if (category) foodFilter.category = new RegExp(category, 'i');
      if (maxPrice) foodFilter.price = { ...(foodFilter.price || {}), $lte: parseFloat(maxPrice) };
      if (minPrice) foodFilter.price = { ...(foodFilter.price || {}), $gte: parseFloat(minPrice) };

      results.food = await foodModel.find(foodFilter)
        .populate('restaurantId', 'name rating isOpen')
        .limit(20);
    }

    // Search restaurants
    if (type === 'all' || type === 'restaurant') {
      const restFilter = { isApproved: true, isActive: true };
      if (q) restFilter.$text = { $search: q };
      if (cuisineType) restFilter.cuisine = new RegExp(cuisineType, 'i');
      if (minRating) restFilter.rating = { $gte: parseFloat(minRating) };

      results.restaurants = await restaurantModel.find(restFilter)
        .select('-ownerId')
        .limit(10);
    }

    res.json({
      success: true,
      query: q || category,
      data: results,
      count: { food: results.food.length, restaurants: results.restaurants.length }
    });
  } catch (error) { next(error); }
};

// GET /api/search/suggestions?q=piz
export const getSearchSuggestions = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const regex = new RegExp(q, 'i');
    const [foods, restaurants] = await Promise.all([
      foodModel.find({ name: regex, isAvailable: true }).select('name category').limit(5),
      restaurantModel.find({ name: regex, isApproved: true }).select('name cuisine').limit(5),
    ]);

    const suggestions = [
      ...foods.map(f => ({ label: f.name, type: 'food', category: f.category })),
      ...restaurants.map(r => ({ label: r.name, type: 'restaurant', cuisine: r.cuisine })),
    ];

    res.json({ success: true, data: suggestions });
  } catch (error) { next(error); }
};
