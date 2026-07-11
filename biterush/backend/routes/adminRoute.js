import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { getDashboardStats, getRevenueChart, changeUserRole } from '../controllers/adminController.js';
import { getAllUsers, toggleUserActive } from '../controllers/userController.js';

const adminRouter = express.Router();

adminRouter.get('/stats',         authenticate, authorize('admin', 'restaurant_owner'), getDashboardStats);
adminRouter.get('/revenue-chart', authenticate, authorize('admin', 'restaurant_owner'), getRevenueChart);
adminRouter.get('/users',         authenticate, authorize('admin'), getAllUsers);
adminRouter.patch('/users/:id/role',          authenticate, authorize('admin'), changeUserRole);
adminRouter.patch('/users/:id/toggle-active', authenticate, authorize('admin'), toggleUserActive);

export default adminRouter;
