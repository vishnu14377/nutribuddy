import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  placeOrder, placeOrderRazorpay, listOrders, userOrders,
  updateStatus, verifyOrder, cancelOrder, getOrderById, getOrderStats,
  listDriverTasks
} from '../controllers/orderController.js';

const orderRouter = express.Router();

// User
orderRouter.post('/place',          authenticate, placeOrder);
orderRouter.post('/place-razorpay', authenticate, placeOrderRazorpay);
orderRouter.post('/userorders',     authenticate, userOrders);
orderRouter.patch('/:id/cancel',    authenticate, cancelOrder);
// Combined Portals (Admin / Owner / Driver)
orderRouter.get('/list',           authenticate, authorize('admin', 'restaurant_owner'), listOrders);
orderRouter.get('/driver-tasks',   authenticate, authorize('delivery_partner'), listDriverTasks);
orderRouter.post('/status',        authenticate, authorize('admin', 'restaurant_owner'), updateStatus);
orderRouter.get('/stats/overview',  authenticate, authorize('admin', 'restaurant_owner'), getOrderStats);
orderRouter.get('/:id',            authenticate, getOrderById);

// Legacy Stripe verify (kept for backward compat)
orderRouter.post('/verify', verifyOrder);

export default orderRouter;