import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  loginUser, registerUser, refreshToken,
  getProfile, updateProfile, changePassword,
  getAllUsers, toggleUserActive, logoutUser
} from '../controllers/userController.js';
import { authorize } from '../middleware/authorize.js';

const userRouter = express.Router();

// Public
userRouter.post('/register', authLimiter, registerUser);
userRouter.post('/login',    authLimiter, loginUser);
userRouter.post('/refresh',  refreshToken);

// Protected - user
userRouter.get('/profile',         authenticate, getProfile);
userRouter.put('/profile',         authenticate, updateProfile);
userRouter.post('/change-password', authenticate, changePassword);
userRouter.post('/logout',          authenticate, logoutUser);

// Admin only
userRouter.get('/all',              authenticate, authorize('admin'), getAllUsers);
userRouter.patch('/:id/toggle-active', authenticate, authorize('admin'), toggleUserActive);

export default userRouter;