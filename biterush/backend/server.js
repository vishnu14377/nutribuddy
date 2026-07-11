import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import { connectDB }    from './config/db.js';
import { logger, httpLogger } from './middleware/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter }   from './middleware/rateLimiter.js';
import { initSocket }   from './socket/socketManager.js';
import notificationRouter from './routes/notificationRoute.js';

// Routes
import userRouter         from './routes/userRoute.js';
import foodRouter         from './routes/foodRoute.js';
import cartRouter         from './routes/cartRoute.js';
import orderRouter        from './routes/orderRoute.js';
import restaurantRouter   from './routes/restaurantRoute.js';
import paymentRouter      from './routes/paymentRoute.js';
import deliveryRouter     from './routes/deliveryRoute.js';
import searchRouter       from './routes/searchRoute.js';
import aiRouter           from './routes/aiRoute.js';
import adminRouter        from './routes/adminRoute.js';

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── HTTP + Socket.io setup ───────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin:      [process.env.FRONTEND_URL || 'http://localhost:5173', process.env.ADMIN_URL || 'http://localhost:5174'],
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});
initSocket(io);

// ─── Security middlewares ────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images to load
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin:      [process.env.FRONTEND_URL || 'http://localhost:5173', process.env.ADMIN_URL || 'http://localhost:5174'],
  credentials: true,
}));

// ─── Request parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(httpLogger);

// ─── Rate limiting ───────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Static files ────────────────────────────────────────────────────────────
app.use('/images', express.static('uploads'));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/user',         userRouter);
app.use('/api/food',         foodRouter);
app.use('/api/cart',         cartRouter);
app.use('/api/order',        orderRouter);
app.use('/api/restaurant',   restaurantRouter);
app.use('/api/restaurants',  restaurantRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/payment',      paymentRouter);
app.use('/api/delivery',     deliveryRouter);
app.use('/api/search',       searchRouter);
app.use('/api/ai',           aiRouter);
app.use('/api/admin',        adminRouter);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'Tomato Food Delivery API', timestamp: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── Error handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── DB + Server start ───────────────────────────────────────────────────────
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`🔌 Socket.io ready on ws://localhost:${PORT}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => process.exit(0));
});