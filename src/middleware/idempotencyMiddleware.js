const { getRedisClient, isRedisConnected } = require('../config/redis');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Ensures mutating requests (POST, PUT, PATCH) are processed only once per unique key.
 * Uses Redis to store and replay responses, preventing duplicate state mutations on unstable networks.
 */
const idempotency = (options = {}) => {
  const { ttl = 86400, headerName = 'x-idempotency-key' } = options;

  return async (req, res, next) => {
    // Only apply to mutating methods
    const mutatingMethods = ['POST', 'PUT', 'PATCH'];
    if (!mutatingMethods.includes(req.method)) {
      return next();
    }

    const key = req.headers[headerName];

    // If no key is provided, we still proceed, but warn in development
    if (!key) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`[IDEMPOTENCY] Missing ${headerName} header for ${req.method} ${req.url}`);
      }
      return next();
    }

    // If Redis is down, we must proceed without idempotency to maintain availability
    if (!isRedisConnected()) {
      return next();
    }

    const redis = getRedisClient();
    const redisKey = `idempotency:${req.path}:${key}`;

    try {
      // 1. Check if we have a cached response
      const cached = await redis.get(redisKey);
      if (cached) {
        const { status, body } = JSON.parse(cached);
        return res.status(status).json(body);
      }

      // 2. Intercept res.send/res.json to cache the response
      const originalSend = res.send;
      res.send = function (body) {
        // Only cache successful or client-error responses (avoid caching server errors)
        if (res.statusCode < 500) {
          const responseToCache = {
            status: res.statusCode,
            body: JSON.parse(body)
          };
          redis.set(redisKey, JSON.stringify(responseToCache), 'EX', ttl).catch(err => {
            logger.error('[IDEMPOTENCY] Redis set error: %o', err);
          });
        }
        
        return originalSend.call(this, body);
      };

      next();
    } catch (err) {
      logger.error('[IDEMPOTENCY] Error: %o', err);
      next();
    }
  };
};

module.exports = idempotency;
