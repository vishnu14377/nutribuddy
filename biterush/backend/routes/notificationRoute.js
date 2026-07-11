import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getMyNotifications, markAsRead, markAllAsRead } from '../controllers/notificationController.js';

const notificationRouter = express.Router();

notificationRouter.get('/',         authenticate, getMyNotifications);
notificationRouter.patch('/read-all', authenticate, markAllAsRead);
notificationRouter.patch('/:id/read', authenticate, markAsRead);

export default notificationRouter;
