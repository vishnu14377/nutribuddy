import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  createRazorpayOrder, verifyRazorpayPayment, getRazorpayKey
} from '../controllers/paymentController.js';

const paymentRouter = express.Router();

paymentRouter.get('/razorpay/key',           authenticate, getRazorpayKey);
paymentRouter.post('/razorpay/create-order', authenticate, createRazorpayOrder);
paymentRouter.post('/razorpay/verify',       authenticate, verifyRazorpayPayment);

export default paymentRouter;
