const cacheManager = require('../utils/cacheManager');
const logger = require('../utils/logger');

// Caches GET responses in Redis to optimize read-heavy endpoints.
const cacheMiddleware = (ttlSeconds = 60) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    // Key Format: cache:{workspaceId}:route:{url}
    const key = cacheManager.generateKey(req.user?.workspaceId || 'global', 'route', req.originalUrl || req.url);

    try {
      const cachedData = await cacheManager.get(key);
      if (cachedData) {
        logger.info(`[CACHE HIT] ${key}`);
        return res.status(200).json(cachedData);
      }

      // Capture and cache the payload before sending it to the client.
      const originalJson = res.json;
      res.json = function (body) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheManager.set(key, body, ttlSeconds).catch(err => {
            logger.error(`[CACHE ERROR] Failed to set ${key}: ${err.message}`);
          });
        }
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      logger.error(`[CACHE ERROR] Error reading ${key}: ${error.message}`);
      next();
    }
  };
};

const invalidateCache = async (workspaceId, pattern = '*') => {
  return cacheManager.invalidate(workspaceId, pattern.replace(/\*/g, ''));
};

module.exports = { cacheMiddleware, invalidateCache, cacheManager };
