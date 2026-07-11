import { redisClient, isRedisAvailable } from '../config/redis.js';
import { logger } from './logger.js';

// Cache middleware — checks Redis before hitting controller
// Usage: router.get('/list', cache('foodList', 300), controller)
export const cache = (key, ttlSeconds = 300) => async (req, res, next) => {
  if (!isRedisAvailable()) return next(); // graceful fallback

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      logger.debug(`Cache HIT: ${key}`);
      return res.json(JSON.parse(cached));
    }
    logger.debug(`Cache MISS: ${key}`);

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (data?.success !== false) {
        redisClient.setex(key, ttlSeconds, JSON.stringify(data)).catch(() => {});
      }
      return originalJson(data);
    };
    next();
  } catch (err) {
    logger.error('Cache middleware error:', err.message);
    next();
  }
};

// Invalidate a cache key
export const invalidateCache = async (...keys) => {
  if (!isRedisAvailable()) return;
  try {
    await Promise.all(keys.map((k) => redisClient.del(k)));
    logger.debug(`Cache invalidated: ${keys.join(', ')}`);
  } catch (err) {
    logger.error('Cache invalidation error:', err.message);
  }
};
