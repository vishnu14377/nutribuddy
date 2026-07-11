import express from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { cache } from '../middleware/cache.js';
import { listFood, addFood, removeFood, toggleFoodAvailability, updateFood } from '../controllers/foodController.js';

const foodRouter = express.Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

foodRouter.get('/list', cache('foodList', 300), listFood);
foodRouter.post('/add',    authenticate, authorize('admin', 'restaurant_owner'), upload.single('image'), addFood);
foodRouter.put('/:id',     authenticate, authorize('admin', 'restaurant_owner'), upload.single('image'), updateFood);
foodRouter.post('/remove', authenticate, authorize('admin', 'restaurant_owner'), removeFood);
foodRouter.patch('/:id/availability', authenticate, authorize('admin', 'restaurant_owner'), toggleFoodAvailability);

export default foodRouter;