const Redis = require('ioredis');

let redisClient;
let bullRedisClient;

/**
 * Initializes the Redis memory hub using ioredis.
 */
const connectRedis = () => {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
        
        // Standard client for cache and rate limiting
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 5, 
            connectTimeout: 5000,
            retryStrategy: (times) => Math.min(times * 200, 5000)
        });

        // Dedicated client for BullMQ (requires maxRetriesPerRequest: null)
        bullRedisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
            retryStrategy: (times) => Math.min(times * 100, 3000)
        });

        redisClient.on('error', (err) => {
            console.warn('[MEMORY HUB] General connection issue:', err.message);
        });

        bullRedisClient.on('error', (err) => {
            console.warn('[MEMORY HUB] Queue connection issue:', err.message);
        });

        redisClient.on('connect', () => {
            console.log('[MEMORY HUB] Strategic memory grid synchronized');
        });
        
        bullRedisClient.on('connect', () => {
            console.log('[MEMORY HUB] Queue grid synchronized');
        });

    } catch (err) {
        console.warn('[MEMORY HUB] Fatal bridge failure.');
    }
};

const getRedisClient = () => redisClient;
const getBullRedisClient = () => bullRedisClient;

module.exports = { connectRedis, getRedisClient, getBullRedisClient };
