const { MemoryStore } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('./logger');

class SmartRateLimitStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'rl:';
    this.localStore = new MemoryStore();
    this.windowMs = options.windowMs;
    
    this.localStore.init({ windowMs: this.windowMs });

    this.redisStore = new RedisStore({
      sendCommand: async (...args) => {
        const client = getRedisClient();
        return await client.call(...args);
      },
      prefix: this.prefix,
    });
  }

  async increment(key) {
    if (isRedisConnected()) {
      try {
        return await this.redisStore.increment(key);
      } catch (err) {
        logger.warn(`[RATE-LIMIT] Redis increment failed for ${key}, falling back to memory: ${err.message}`);
        return await this.localStore.increment(key);
      }
    }
    return await this.localStore.increment(key);
  }

  async decrement(key) {
    if (isRedisConnected()) {
      try {
        return await this.redisStore.decrement(key);
      } catch (err) {
        return await this.localStore.decrement(key);
      }
    }
    return await this.localStore.decrement(key);
  }

  async resetKey(key) {
    if (isRedisConnected()) {
      try {
        return await this.redisStore.resetKey(key);
      } catch (err) {
        return await this.localStore.resetKey(key);
      }
    }
    return await this.localStore.resetKey(key);
  }
}

module.exports = SmartRateLimitStore;
