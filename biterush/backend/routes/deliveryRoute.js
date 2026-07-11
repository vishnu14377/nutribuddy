import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import {
  getPartnerProfile, registerPartner, toggleOnlineStatus,
  updateLocation, getCurrentOrder, getDeliveryOffers, acceptOrder, markDelivered, getAllPartners
} from '../controllers/deliveryController.js';

const deliveryRouter = express.Router();

deliveryRouter.post('/register',        authenticate, authorize('delivery_partner', 'admin'), registerPartner);
deliveryRouter.get('/profile',          authenticate, authorize('delivery_partner', 'admin'), getPartnerProfile);
deliveryRouter.patch('/toggle-online',  authenticate, authorize('delivery_partner'), toggleOnlineStatus);
deliveryRouter.post('/update-location', authenticate, authorize('delivery_partner'), updateLocation);
deliveryRouter.get('/current-order',    authenticate, authorize('delivery_partner'), getCurrentOrder);
deliveryRouter.get('/offers',           authenticate, authorize('delivery_partner'), getDeliveryOffers);
deliveryRouter.patch('/accept-order/:orderId',   authenticate, authorize('delivery_partner'), acceptOrder);
deliveryRouter.patch('/mark-delivered/:orderId', authenticate, authorize('delivery_partner'), markDelivered);

// Admin
deliveryRouter.get('/all', authenticate, authorize('admin'), getAllPartners);

export default deliveryRouter;
