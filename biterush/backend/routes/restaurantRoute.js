import express from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { cache } from '../middleware/cache.js';
import {
  registerRestaurant, getRestaurants, getRestaurantById,
  getRestaurantMenu, updateRestaurant, approveRestaurant,
  toggleRestaurantOpen, getMyRestaurants, getPendingRestaurants
} from '../controllers/restaurantController.js';

const restaurantRouter = express.Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Public
restaurantRouter.get('/',              cache('restaurants_all', 600), getRestaurants);
restaurantRouter.get('/pending',       authenticate, authorize('admin'), getPendingRestaurants);
restaurantRouter.get('/my',            authenticate, authorize('restaurant_owner', 'admin'), getMyRestaurants);
restaurantRouter.get('/:id',           getRestaurantById);
restaurantRouter.get('/:id/menu',      getRestaurantMenu);

// Owner
restaurantRouter.post('/register',           authenticate, authorize('restaurant_owner', 'admin'), upload.single('image'), registerRestaurant);
restaurantRouter.put('/:id',                 authenticate, authorize('restaurant_owner', 'admin'), upload.single('image'), updateRestaurant);
restaurantRouter.patch('/:id/toggle-open',   authenticate, authorize('restaurant_owner', 'admin'), toggleRestaurantOpen);

// Admin only
restaurantRouter.patch('/:id/approve', authenticate, authorize('admin'), approveRestaurant);

export default restaurantRouter;
