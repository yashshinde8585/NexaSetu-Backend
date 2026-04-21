const Redis = require('ioredis');
const config = require('./config');
const logger = require('../utils/logger');

let redisClient;
let bullRedisClient;

// Connect to Redis and configure connection behavior
const connectRedis = async () => {
    try {
        const redisUrl = config.redis.url;
        
        const commonOptions = {
            maxRetriesPerRequest: 10, 
            connectTimeout: 15000,
            retryStrategy: (times) => {
                const delay = Math.min(times * 100, 3000);
                return delay;
            },
            reconnectOnError: (err) => {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) return true;
                return false;
            }
        };

        // Primary client for caching, sessions, and rate limiting
        redisClient = new Redis(redisUrl, {
            ...commonOptions,
            enableReadyCheck: true
        });

        // Specialized client for BullMQ to handle blocking operations and reliable queue polling
        bullRedisClient = new Redis(redisUrl, {
            ...commonOptions,
            maxRetriesPerRequest: null
        });

        // Diagnostic version check
        redisClient.once('ready', async () => {
            try {
                const info = await redisClient.info('server');
                const versionMatch = info.match(/redis_version:([0-9\.]+)/);
                const version = versionMatch ? versionMatch[1] : 'unknown';
                
                logger.info(`[REDIS] Server version detected: ${version}`);
                
                // BullMQ requires Redis 6.2+ for certain atomic features
                const [major, minor] = version.split('.').map(Number);
                if (major < 6 || (major === 6 && minor < 2)) {
                    logger.warn(`[REDIS] COMPATIBILITY WARNING: Redis 6.2+ required for stable job processing. Detected: ${version}`);
                }
            } catch (err) {
                logger.warn(`[REDIS] Could not verify server version: ${err.message}`);
            }
        });

        redisClient.on('error', (err) => {
            logger.error(`[REDIS] Cache client error: ${err.message}`);
            logger.info('[REDIS] Running in degraded mode (Cache/Rate Limiting disabled)');
        });

        bullRedisClient.on('error', (err) => {
            logger.error(`[REDIS] Queue client error: ${err.message}`);
            logger.info('[REDIS] Running in degraded mode (Background Jobs disabled)');
        });

        redisClient.on('connect', () => logger.info('[REDIS] Cache client link established'));
        redisClient.on('ready', () => logger.info('[REDIS] Cache client fully synchronized'));
        
        bullRedisClient.on('connect', () => logger.info('[REDIS] Queue client link established'));
        bullRedisClient.on('ready', () => logger.info('[REDIS] Queue client fully synchronized'));

    } catch (err) {
        logger.error(`[REDIS] Fatal bridge failure: ${err.message}`);
    }
};

const getRedisClient = () => redisClient;
const getBullRedisClient = () => bullRedisClient;

/**
 * Safeguard to prevent application errors when Redis is temporarily unreachable.
 */
const isRedisConnected = () => {
    return redisClient && redisClient.status === 'ready';
};

/**
 * Connection Guard: Returns true only if the queue client is ready.
 */
const isQueueConnected = () => {
    return bullRedisClient && bullRedisClient.status === 'ready';
};

module.exports = { 
    connectRedis, 
    getRedisClient, 
    getBullRedisClient,
    isRedisConnected,
    isQueueConnected
};


