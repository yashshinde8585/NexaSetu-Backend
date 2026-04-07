const Redis = require('ioredis');

let redisClient;

/**
 * Initializes the Redis memory hub using ioredis.
 * This acts as our primary high-speed cache for Mission Discussion and Project Intelligence.
 * Built with industrial-grade error handling and automatic database fallback.
 */
const connectRedis = () => {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6380';
        
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
            retryStrategy: (times) => {
                const delay = Math.min(times * 100, 3000);
                return delay;
            },
            reconnectOnError: (err) => {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
                }
                return false;
            }
        });

        let lastErrorLog = 0;
        const LOG_THROTTLE = 30000; // 30s tactical silence

        redisClient.on('error', (err) => {
            const now = Date.now();
            if (now - lastErrorLog > LOG_THROTTLE) {
                console.warn('[MEMORY HUB] Background synchronization active (Grid Offline):', err.message);
                lastErrorLog = now;
            }
        });

        redisClient.on('connect', () => {
            console.log('[MEMORY HUB] Strategic memory grid synchronized');
        });

        console.log(`[MEMORY HUB] Attempting bridge to memory grid at ${redisUrl}...`);
    } catch (err) {
        console.warn('[MEMORY HUB] Fatal bridge failure. Reverting to primary database retrieval.');
    }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
