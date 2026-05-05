const { MemoryStore } = require('express-rate-limit');
const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('./logger');

const createSmartRateLimitStore = function(options = {}) {
  const prefix = options.prefix || 'rl:';
  const windowMs = options.windowMs || 60000;
  const localStore = new MemoryStore();
  localStore.init({ windowMs });

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
        const [totalHits, pttl] = await redis.eval(luaIncrement, 1, fullKey, windowMs);
        
        return {
          totalHits,
          resetTime: new Date(Date.now() + pttl)
        };
      } catch (err) {
        logger.warn(`[RATE-LIMIT] Redis increment failed for ${key}, falling back to memory: ${err.message}`);
      }
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
        await localStore.decrement(key);
      }
    } else {
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
        await localStore.resetKey(key);
      }
    }
    await localStore.resetKey(key);
  };

  return {
    increment,
    decrement,
    resetKey
  };
};

module.exports = createSmartRateLimitStore;
