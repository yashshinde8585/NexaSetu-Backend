const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('./logger');

const cacheGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const data = await getRedisClient().get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    logger.warn('[CACHE] Signal read failure, bypassing to primary database.');
    return null;
  }
};

const cacheSet = async (key, value, ttl = 3600) => {
  if (!isRedisConnected()) return;
  try {
    await getRedisClient().set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    logger.warn(
      '[CACHE] Signal write failure, data persisted in database only.'
    );
  }
};

const cacheDel = async (key) => {
  if (!isRedisConnected()) return;
  try {
    await getRedisClient().del(key);
    logger.info(`[MEMORY GRID] Cache invalidated: ${key}`);
  } catch {
    logger.warn(
      '[MEMORY GRID] Signal synchronization failed, moving to next transmission.'
    );
  }
};

module.exports = { cacheGet, cacheSet, cacheDel };
