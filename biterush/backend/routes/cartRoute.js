import express from 'express';
import { addToCart, getCart, removeFromCart } from '../controllers/cartController.js';
import { authenticate } from '../middleware/auth.js';

const cartRouter = express.Router();

cartRouter.post("/get",    authenticate, getCart);
cartRouter.post("/add",    authenticate, addToCart);
cartRouter.post("/remove", authenticate, removeFromCart);

export default cartRouter;