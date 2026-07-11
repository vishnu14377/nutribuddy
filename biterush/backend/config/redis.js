import Redis from 'ioredis';
import { logger } from '../middleware/logger.js';

let redisClient = null;
let _isAvailable = false;

const createRedisClient = () => {
  try {
    const client = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis: max retries reached. Running without cache.');
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      connectTimeout: 3000,
    });

    client.on('connect', () => {
      _isAvailable = true;
      logger.info('✅ Redis connected');
    });

    client.on('error', (err) => {
      _isAvailable = false;
      logger.warn(`Redis unavailable: ${err.message}. App running without cache.`);
    });

    client.on('close', () => {
      _isAvailable = false;
    });

    // Attempt connection (non-blocking)
    client.connect().catch(() => {});

    return client;
  } catch (err) {
    logger.warn(`Redis init failed: ${err.message}. App running without cache.`);
    return null;
  }
};

redisClient = createRedisClient();

export { redisClient };
export const isRedisAvailable = () => _isAvailable && redisClient !== null;

export default redisClient;
