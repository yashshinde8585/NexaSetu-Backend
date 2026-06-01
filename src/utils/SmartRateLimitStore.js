const { MemoryStore } = require('express-rate-limit');
const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('./logger');

const createSmartRateLimitStore = function (options = {}) {
  const prefix = options.prefix || 'rl:';
  const windowMs = options.windowMs || 60000;
  const localStore = new MemoryStore();
  localStore.init({ windowMs });

  let lastWarningTime = 0;
  const WARNING_THROTTLE_MS = 10000; // 10 seconds

  const logFallbackWarning = (reason, details = '') => {
    const now = Date.now();
    if (now - lastWarningTime > WARNING_THROTTLE_MS) {
      lastWarningTime = now;
      logger.warn(
        `[RATE-LIMIT-FALLBACK] Degrading to local memory store. Reason: ${reason}. ${details}`
      );
    }
  };

  const luaIncrement = `
    local current = redis.call("INCR", KEYS[1])
    if current == 1 then
      redis.call("PEXPIRE", KEYS[1], ARGV[1])
    end
    local ttl = redis.call("PTTL", KEYS[1])
    return {current, ttl}
  `;

  const increment = async (key) => {
    const fullKey = `${prefix}${key}`;

    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        const [totalHits, pttl] = await redis.eval(
          luaIncrement,
          1,
          fullKey,
          windowMs
        );

        return {
          totalHits,
          resetTime: new Date(Date.now() + pttl),
        };
      } catch (err) {
        logFallbackWarning(
          'Redis eval error',
          `key=${key}, err=${err.message}`
        );
      }
    } else {
      logFallbackWarning('Redis disconnected', `key=${key}`);
    }

    return await localStore.increment(key);
  };

  const decrement = async (key) => {
    const fullKey = `${prefix}${key}`;
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.decr(fullKey);
      } catch (err) {
        logFallbackWarning(
          'Redis decr error',
          `key=${key}, err=${err.message}`
        );
        await localStore.decrement(key);
      }
    } else {
      logFallbackWarning('Redis disconnected on decr', `key=${key}`);
      await localStore.decrement(key);
    }
  };

  const resetKey = async (key) => {
    const fullKey = `${prefix}${key}`;
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.del(fullKey);
      } catch (err) {
        logFallbackWarning('Redis del error', `key=${key}, err=${err.message}`);
        await localStore.resetKey(key);
      }
    } else {
      logFallbackWarning('Redis disconnected on reset', `key=${key}`);
    }
    await localStore.resetKey(key);
  };

  return {
    increment,
    decrement,
    resetKey,
  };
};

module.exports = createSmartRateLimitStore;
