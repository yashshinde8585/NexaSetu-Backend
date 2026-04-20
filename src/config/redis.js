const Redis = require('ioredis');
const config = require('./config');
const logger = require('../utils/logger');

let redisClient;
let bullRedisClient;

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

        // Standard client for cache and rate limiting
        redisClient = new Redis(redisUrl, {
            ...commonOptions,
            enableReadyCheck: true
        });

        // Dedicated client for BullMQ (requires maxRetriesPerRequest: null)
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
                
                const [major, minor] = version.split('.').map(Number);
                if (major < 6 || (major === 6 && minor < 2)) {
                    logger.warn(`[REDIS] COMPATIBILITY WARNING: BullMQ requires Redis 6.2+. Detected version ${version} may cause runtime failures.`);
                }
            } catch (err) {
                logger.warn(`[REDIS] Could not verify server version: ${err.message}`);
            }
        });

        redisClient.on('error', (err) => {
            logger.error(`[REDIS] Cache client error: ${err.message}`);
        });

        bullRedisClient.on('error', (err) => {
            logger.error(`[REDIS] Queue client error: ${err.message}`);
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

module.exports = { connectRedis, getRedisClient, getBullRedisClient };

