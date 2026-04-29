const { getRedisClient, isRedisConnected, withTimeout } = require('../config/redis');
const crypto = require('crypto');
const logger = require('../utils/logger');

const idempotency = (options = {}) => {
  const { ttl = 86400, headerName = 'x-idempotency-key' } = options;

  return async (req, res, next) => {
    const mutatingMethods = ['POST', 'PUT', 'PATCH'];
    if (!mutatingMethods.includes(req.method)) {
      return next();
    }

    const key = req.headers[headerName];

    if (!key) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`[IDEMPOTENCY] Missing ${headerName} header for ${req.method} ${req.url}`);
      }
      return next();
    }

    if (!isRedisConnected()) {
      return next();
    }

    const redis = getRedisClient();
    const redisKey = `idempotency:${req.path}:${key}`;

    try {
      const cached = await withTimeout(redis.get(redisKey), 500); 
      if (cached) {
        if (cached === 'IN_PROGRESS') {
          return res.status(409).json({
            status: 'fail',
            message: 'A request with this idempotency key is already being processed.'
          });
        }
        const { status, body } = JSON.parse(cached);
        logger.info(`[IDEMPOTENCY] Replaying response for key: ${key}`);
        return res.status(status).json(body);
      }

      const locked = await withTimeout(redis.set(redisKey, 'IN_PROGRESS', 'NX', 'EX', 60), 500);
      if (!locked) {
        return res.status(409).json({
          status: 'fail',
          message: 'Conflict: Request already in progress.'
        });
      }

      const originalJson = res.json;
      res.json = function (body) {
        if (res.statusCode < 500) {
          const responseToCache = {
            status: res.statusCode,
            body: body
          };
          redis.set(redisKey, JSON.stringify(responseToCache), 'EX', ttl).catch(err => {
            logger.error('[IDEMPOTENCY] Redis set error: %o', err);
          });
        } else {
          redis.del(redisKey).catch(() => {});
        }
        
        return originalJson.call(this, body);
      };

      next();
    } catch (err) {
      logger.error('[IDEMPOTENCY] Error: %o', err);
      next();
    }
  };
};

module.exports = idempotency;
