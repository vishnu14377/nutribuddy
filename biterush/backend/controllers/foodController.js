import foodModel from "../models/foodModel.js";
import restaurantModel from "../models/restaurantModel.js";
import fs from 'fs';
import path from 'path';
import { AppError } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";

// GET /api/food/list
export const listFood = async (req, res, next) => {
  try {
    const { category, restaurantId } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (restaurantId) filter.restaurantId = restaurantId;

    const foods = await foodModel.find(filter).populate('restaurantId', 'name');
    res.json({ success: true, data: foods });
  } catch (error) { next(error); }
};

// POST /api/food/add
export const addFood = async (req, res, next) => {
  try {
    const { restaurantId } = req.body;
    if (!restaurantId) throw new AppError("Restaurant ID is required", 400);

    // Authorization check: Admin or Restaurant Owner of this specific restaurant
    if (req.user.role !== 'admin') {
      const restaurant = await restaurantModel.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.id) {
        throw new AppError("Not authorized to add food for this restaurant", 403);
      }
    }

    if (!req.file) throw new AppError("Food image is required", 400);

    const food = new foodModel({
      name:            req.body.name,
      description:     req.body.description,
      price:           req.body.price,
      category:        req.body.category,
      image:           req.file.filename,
      restaurantId:    restaurantId,
      preparationTime: req.body.preparationTime || 15,
      tags:            req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : [],
    });

    await food.save();
    await invalidateCache('foodList', `restaurant_menu_${restaurantId}`);
    res.status(201).json({ success: true, message: "Food Added", data: food });
  } catch (error) { next(error); }
};

// DELETE /api/food/remove
export const removeFood = async (req, res, next) => {
  try {
    const food = await foodModel.findById(req.body.id);
    if (!food) throw new AppError("Food item not found", 404);

    // Authorization check
    if (req.user.role !== 'admin') {
      const restaurant = await restaurantModel.findById(food.restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.id) {
        throw new AppError("Not authorized to remove food for this restaurant", 403);
      }
    }

    // Delete the image file
    const imagePath = `uploads/${food.image}`;
    if (fs.existsSync(imagePath)) fs.unlink(imagePath, () => {});

    await foodModel.findByIdAndDelete(req.body.id);
    await invalidateCache('foodList', `restaurant_menu_${food.restaurantId}`);
    res.json({ success: true, message: "Food Removed" });
  } catch (error) { next(error); }
};

// PUT /api/food/:id  — update food item
export const updateFood = async (req, res, next) => {
  try {
    const food = await foodModel.findById(req.params.id);
    if (!food) throw new AppError('Food item not found', 404);

    // Authorization
    if (req.user.role !== 'admin') {
      const restaurant = await restaurantModel.findById(food.restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.id) {
        throw new AppError('Not authorized to edit this food item', 403);
      }
    }

    const { name, description, price, category, preparationTime } = req.body;
    if (name)            food.name            = name;
    if (description)     food.description     = description;
    if (price)           food.price           = Number(price);
    if (category)        food.category        = category;
    if (preparationTime) food.preparationTime = Number(preparationTime);

    // Replace image if a new one was uploaded
    if (req.file) {
      const oldImagePath = path.join('uploads', food.image);
      if (fs.existsSync(oldImagePath)) fs.unlink(oldImagePath, () => {});
      food.image = req.file.filename;
    }

    await food.save();
    await invalidateCache('foodList', `restaurant_menu_${food.restaurantId}`);
    res.json({ success: true, message: 'Food updated successfully', data: food });
  } catch (error) { next(error); }
};

// PATCH /api/food/:id/availability
export const toggleFoodAvailability = async (req, res, next) => {
  try {
    const food = await foodModel.findById(req.params.id);
    if (!food) throw new AppError("Food not found", 404);

    // Authorization
    if (req.user.role !== 'admin') {
      const restaurant = await restaurantModel.findById(food.restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.id) {
        throw new AppError("Not authorized", 403);
      }
    }

    food.isAvailable = !food.isAvailable;
    await food.save();
    await invalidateCache('foodList', `restaurant_menu_${food.restaurantId}`);
    res.json({ success: true, message: `Item is now ${food.isAvailable ? 'available' : 'unavailable'}` });
  } catch (error) { next(error); }
};
