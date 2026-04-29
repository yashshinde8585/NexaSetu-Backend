const { MemoryStore } = require('express-rate-limit');
const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('./logger');

class SmartRateLimitStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs || 60000;
    this.localStore = new MemoryStore();
    this.localStore.init({ windowMs: this.windowMs });

    this.luaIncrement = `
      local current = redis.call("INCR", KEYS[1])
      if current == 1 then
        redis.call("PEXPIRE", KEYS[1], ARGV[1])
      end
      local ttl = redis.call("PTTL", KEYS[1])
      return {current, ttl}
    `;
  }

  async increment(key) {
    const fullKey = `${this.prefix}${key}`;
    
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        const [totalHits, pttl] = await redis.eval(this.luaIncrement, 1, fullKey, this.windowMs);
        
        return {
          totalHits,
          resetTime: new Date(Date.now() + pttl)
        };
      } catch (err) {
        logger.warn(`[RATE-LIMIT] Redis increment failed for ${key}, falling back to memory: ${err.message}`);
      }
    }
    
    return await this.localStore.increment(key);
  }

  async decrement(key) {
    const fullKey = `${this.prefix}${key}`;
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.decr(fullKey);
      } catch (err) {
        await this.localStore.decrement(key);
      }
    } else {
      await this.localStore.decrement(key);
    }
  }

  async resetKey(key) {
    const fullKey = `${this.prefix}${key}`;
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.del(fullKey);
      } catch (err) {
        await this.localStore.resetKey(key);
      }
    }
    await this.localStore.resetKey(key);
  }
}

module.exports = SmartRateLimitStore;
