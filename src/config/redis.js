const Redis = require('ioredis');
const config = require('./config');
const logger = require('../utils/logger');

let redisClient;
let bullRedisClient;

const connectRedis = () => {
    try {
        const redisUrl = config.redis.url;
        
        const commonOptions = {
            maxRetriesPerRequest: 5, 
            connectTimeout: 10000,
            retryStrategy: (times) => Math.min(times * 100, 3000)
        };

        // Standard client for cache and rate limiting
        redisClient = new Redis(redisUrl, {
            ...commonOptions,
            maxRetriesPerRequest: 5
        });

        // Dedicated client for BullMQ (requires maxRetriesPerRequest: null)
        bullRedisClient = new Redis(redisUrl, {
            ...commonOptions,
            maxRetriesPerRequest: null
        });

        redisClient.on('error', (err) => {
            logger.error(`[REDIS] General connection error: ${err.message}`);
        });

        bullRedisClient.on('error', (err) => {
            logger.error(`[REDIS] Queue connection error: ${err.message}`);
        });

        redisClient.on('connect', () => {
            logger.info('[REDIS] Cache client synchronized');
        });
        
        bullRedisClient.on('connect', () => {
            logger.info('[REDIS] Queue client synchronized');
        });

    } catch (err) {
        logger.error(`[REDIS] Fatal bridge failure: ${err.message}`);
    }
};

const getRedisClient = () => redisClient;
const getBullRedisClient = () => bullRedisClient;

module.exports = { connectRedis, getRedisClient, getBullRedisClient };

