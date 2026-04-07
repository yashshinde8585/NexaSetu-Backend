const { getRedisClient } = require('../config/redis');

/**
 * Returns true only when the Redis client exists and is fully connected.
 * Centralises the guard that was previously duplicated in every controller.
 */
const isReady = () => {
  const client = getRedisClient();
  return !!(client && client.status === 'ready');
};

/**
 * Reads a JSON value from Redis cache.
 * Returns null on miss, disconnection, or read error (safe fallback).
 */
const cacheGet = async (key) => {
  if (!isReady()) return null;
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
  if (!isReady()) return;
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
  if (!isReady()) return;
  try {
    await getRedisClient().del(key);
    console.log(`[MEMORY GRID] Cache invalidated: ${key}`);
  } catch {
    console.warn('[MEMORY GRID] Signal synchronization failed, moving to next transmission.');
  }
};

module.exports = { cacheGet, cacheSet, cacheDel };
