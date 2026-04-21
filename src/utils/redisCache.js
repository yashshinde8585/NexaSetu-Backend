const { getRedisClient, isRedisConnected } = require('../config/redis');

/**
 * Retrieves a cached value.
 * Fails gracefully by returning null on miss or connection issues to ensure system availability.
 */
const cacheGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const data = await getRedisClient().get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    console.warn('[CACHE] Signal read failure, bypassing to primary database.');
    return null;
  }
};

/**
 * Writes a JSON value to Redis cache with an optional TTL (default 1 hour).
 * Silently skips if Redis is offline.
 */
const cacheSet = async (key, value, ttl = 3600) => {
  if (!isRedisConnected()) return;
  try {
    await getRedisClient().set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    console.warn('[CACHE] Signal write failure, data persisted in database only.');
  }
};

/**
 * Deletes a key from Redis cache to invalidate stale data.
 * Silently skips if Redis is offline.
 */
const cacheDel = async (key) => {
  if (!isRedisConnected()) return;
  try {
    await getRedisClient().del(key);
    console.log(`[MEMORY GRID] Cache invalidated: ${key}`);
  } catch {
    console.warn('[MEMORY GRID] Signal synchronization failed, moving to next transmission.');
  }
};

module.exports = { cacheGet, cacheSet, cacheDel };
