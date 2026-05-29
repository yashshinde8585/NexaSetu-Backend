const cacheManager = require('../utils/cacheManager');
const logger = require('../utils/logger');

const cacheMiddleware = (entity = 'route', ttlSeconds = 60) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = cacheManager.generateKey(
      req.user?.workspaceId || 'global',
      entity,
      req.originalUrl || req.url
    );

    try {
      const cachedData = await cacheManager.get(key);
      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const originalJson = res.json;
      res.json = function (body) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheManager.set(key, body, ttlSeconds).catch((err) => {});
        }
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      next();
    }
  };
};

const invalidateCache = async (workspaceId, pattern = '*') => {
  // If pattern is '*', we invalidate everything for the workspace
  // otherwise we invalidate exactly what was requested.
  const cleanPattern = pattern === '*' ? '' : pattern.replace(/\*/g, '');
  await cacheManager.invalidate(workspaceId, cleanPattern);
};

module.exports = { cacheMiddleware, invalidateCache, cacheManager };
