const {
  getRedisClient,
  isRedisConnected,
  withTimeout,
} = require('../config/redis');
const logger = require('./logger');

// Cache Manager Utility: Centralizes cache key construction and invalidation logic.

const generateKey = (workspaceId, entity, identifier = 'list') => {
  const cleanId =
    typeof identifier === 'string'
      ? identifier.replace(/\/$/, '').replace(/\?$/, '')
      : identifier;
  return `cache:${workspaceId || 'global'}:${entity}:${cleanId}`;
};

const invalidate = async (workspaceId, pattern) => {
  if (!isRedisConnected()) return;

  const redis = getRedisClient();
  const keyPattern = `cache:${workspaceId}:${pattern}*`;
  let cursor = '0';
  let totalPurged = 0;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        keyPattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        totalPurged += keys.length;
      }
    } while (cursor !== '0');

    if (totalPurged > 0) {
      logger.info(
        `[CACHE INVALIDATE] Purged ${totalPurged} keys for pattern: ${keyPattern}`
      );
    }
  } catch (err) {
    logger.error(
      `[CACHE ERROR] Invalidation failed for ${keyPattern}: ${err.message}`
    );
  }
};

const set = async (key, value, ttl = 3600) => {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedisClient();
    await withTimeout(redis.set(key, JSON.stringify(value), 'EX', ttl), 1000);
  } catch (err) {
    logger.warn(`[CACHE SET ERROR] Failed to cache ${key}: ${err.message}`);
  }
};

const get = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const redis = getRedisClient();
    const data = await withTimeout(redis.get(key), 800);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.warn(`[CACHE GET ERROR] Failed to retrieve ${key}: ${err.message}`);
    return null;
  }
};

const getWithFallback = async (newKey, legacyKey) => {
  if (!isRedisConnected()) return null;

  const data = await get(newKey);
  if (data) return data;

  if (legacyKey) {
    const legacyData = await get(legacyKey);
    if (legacyData) {
      set(newKey, legacyData).catch(() => {});
      return legacyData;
    }
  }
  return null;
};

const acquireLock = async (resource, ttl = 10) => {
  if (!isRedisConnected()) return true;
  const redis = getRedisClient();
  const lockKey = `lock:${resource}`;
  const result = await redis.set(lockKey, 'locked', 'EX', ttl, 'NX');
  return result === 'OK';
};

const releaseLock = async (resource) => {
  if (!isRedisConnected()) return;
  const redis = getRedisClient();
  await redis.del(`lock:${resource}`);
};

module.exports = {
  generateKey,
  invalidate,
  set,
  get,
  getWithFallback,
  acquireLock,
  releaseLock,
};
