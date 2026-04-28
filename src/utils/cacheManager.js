const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('./logger');

// Cache Manager Utility: Centralizes cache key construction and invalidation logic.
class CacheManager {
  // Key Format: cache:{workspaceId}:{entity}:{identifier}
  generateKey(workspaceId, entity, identifier = 'list') {
    return `cache:${workspaceId}:${entity}:${identifier}`;
  }

  // Safely invalidates cache by pattern (e.g., 'task' or 'project').
  async invalidate(workspaceId, pattern) {
    if (!isRedisConnected()) return;

    const redis = getRedisClient();
    const keyPattern = `cache:${workspaceId}:${pattern}*`;
    
    try {
      const keys = await redis.keys(keyPattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`[CACHE INVALIDATE] Purged ${keys.length} keys for pattern: ${keyPattern}`);
      }
    } catch (err) {
      logger.error(`[CACHE ERROR] Invalidation failed: ${err.message}`);
    }
  }

  async set(key, value, ttl = 3600) {
    if (!isRedisConnected()) return;
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async get(key) {
    if (!isRedisConnected()) return null;
    const redis = getRedisClient();
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}

module.exports = new CacheManager();
