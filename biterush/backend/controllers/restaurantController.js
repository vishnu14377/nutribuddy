import restaurantModel from "../models/restaurantModel.js";
import foodModel from "../models/foodModel.js";
import { AppError } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";
import { notifyAdmins } from "../services/notificationService.js";

// POST /api/restaurant/register
export const registerRestaurant = async (req, res, next) => {
  try {
    const { name, description, cuisine, email, phone, address, location } = req.body;
    const parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
    const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    const cuisineList = Array.isArray(cuisine)
      ? cuisine
      : String(cuisine || '').split(',').map(item => item.trim()).filter(Boolean);
    const existing = await restaurantModel.findOne({ email });
    if (existing) throw new AppError("Restaurant with this email already exists", 409);

    const restaurant = new restaurantModel({
      name, description,
      cuisine: cuisineList,
      email, phone, address: parsedAddress, ownerId: req.user.id,
      ...(parsedLocation && { location: parsedLocation }),
      image: req.file ? req.file.filename : '',
    });
    await restaurant.save();
    await invalidateCache('restaurants_all');

    // Notify admins
    notifyAdmins("New Restaurant Application", `Vendor "${name}" has submitted a new application`, 'new_vendor', { restaurantId: restaurant._id });

    res.status(201).json({ success: true, data: restaurant, message: 'Restaurant registered. Pending admin approval.' });
  } catch (error) { next(error); }
};

// GET /api/restaurants
export const getRestaurants = async (req, res, next) => {
  try {
    const { city, cuisine, isOpen, minRating } = req.query;
    const filter = { isApproved: true, isActive: true };
    if (city) filter['address.city'] = new RegExp(city, 'i');
    if (cuisine) filter.cuisine = new RegExp(cuisine, 'i');
    if (isOpen !== undefined) filter.isOpen = isOpen === 'true';
    if (minRating) filter.rating = { $gte: parseFloat(minRating) };

    const restaurants = await restaurantModel.find(filter)
      .select('-ownerId')
      .sort({ rating: -1, createdAt: -1 });
    res.json({ success: true, data: restaurants, count: restaurants.length });
  } catch (error) { next(error); }
};

// GET /api/restaurant/:id
export const getRestaurantById = async (req, res, next) => {
  try {
    const restaurant = await restaurantModel.findById(req.params.id);
    if (!restaurant) throw new AppError("Restaurant not found", 404);
    res.json({ success: true, data: restaurant });
  } catch (error) { next(error); }
};

// GET /api/restaurant/:id/menu
export const getRestaurantMenu = async (req, res, next) => {
  try {
    const restaurant = await restaurantModel.findById(req.params.id);
    if (!restaurant) throw new AppError("Restaurant not found", 404);

    const menu = await foodModel.find({ restaurantId: req.params.id, isAvailable: true });
    res.json({ success: true, data: { restaurant, menu } });
  } catch (error) { next(error); }
};

// PUT /api/restaurant/:id  (owner)
export const updateRestaurant = async (req, res, next) => {
  try {
    const restaurant = await restaurantModel.findById(req.params.id);
    if (!restaurant) throw new AppError("Restaurant not found", 404);
    if (restaurant.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new AppError("Not authorized to update this restaurant", 403);
    }
    const updates = req.body;
    if (req.file) updates.image = req.file.filename;
    const updated = await restaurantModel.findByIdAndUpdate(req.params.id, updates, { new: true });
    await invalidateCache('restaurants_all', `restaurant_${req.params.id}`);
    res.json({ success: true, data: updated, message: 'Restaurant updated' });
  } catch (error) { next(error); }
};

// PATCH /api/restaurant/:id/approve  (admin)
export const approveRestaurant = async (req, res, next) => {
  try {
    const { approve } = req.body;
    const restaurant = await restaurantModel.findByIdAndUpdate(
      req.params.id,
      { isApproved: approve !== false },
      { new: true }
    );
    if (!restaurant) throw new AppError("Restaurant not found", 404);
    await invalidateCache('restaurants_all');
    res.json({ success: true, data: restaurant, message: `Restaurant ${restaurant.isApproved ? 'approved' : 'rejected'}` });
  } catch (error) { next(error); }
};

// PATCH /api/restaurant/:id/toggle-open  (owner)
export const toggleRestaurantOpen = async (req, res, next) => {
  try {
    const restaurant = await restaurantModel.findById(req.params.id);
    if (!restaurant) throw new AppError("Restaurant not found", 404);
    if (restaurant.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new AppError("Not authorized", 403);
    }
    restaurant.isOpen = !restaurant.isOpen;
    await restaurant.save();
    res.json({ success: true, message: `Restaurant is now ${restaurant.isOpen ? 'open' : 'closed'}` });
  } catch (error) { next(error); }
};

// GET /api/restaurant/my  (owner - their own restaurants)
export const getMyRestaurants = async (req, res, next) => {
  try {
    const restaurants = await restaurantModel.find({ ownerId: req.user.id });
    res.json({ success: true, data: restaurants });
  } catch (error) { next(error); }
};

// GET /api/restaurant/pending  (admin - pending approval)
export const getPendingRestaurants = async (req, res, next) => {
  try {
    const restaurants = await restaurantModel.find({ isApproved: false }).populate('ownerId', 'name email phone');
    res.json({ success: true, data: restaurants });
  } catch (error) { next(error); }
};
