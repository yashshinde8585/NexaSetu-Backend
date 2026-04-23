const Redis = require('ioredis');
const config = require('./config');
const logger = require('../utils/logger');

let redisClient;
let bullRedisClient;

const logThrottle = {
    lastError: 0,
    lastDegraded: 0,
    errorCount: 0,
    INTERVAL: 60000
};

const throttleLog = (type, message, level = 'warn') => {
    const now = Date.now();
    if (now - logThrottle[type] > logThrottle.INTERVAL) {
        logger[level](message);
        logThrottle[type] = now;
    }
};

const getRetryStrategy = (clientName) => (times) => {
    const delay = Math.min(times * 100, 10000);
    if (times > 20) {
        throttleLog('lastError', `[REDIS] ${clientName} - Persistent connection failure after ${times} attempts. Check REDIS_URL.`, 'error');
    } else {
        logger.info(`[REDIS] ${clientName} - Reconnecting... attempt ${times}`);
    }
    return delay;
};

const createClient = (name, options = {}) => {
    const client = new Redis(config.redis.url, {
        maxRetriesPerRequest: 20,
        connectTimeout: 15000,
        retryStrategy: getRetryStrategy(name),
        ...options
    });

    client.on('connect', () => logger.info(`[REDIS] ${name} link established`));
    client.on('ready', () => logger.info(`[REDIS] ${name} fully synchronized (READY)`));
    client.on('error', (err) => {
        throttleLog('lastError', `[REDIS] ${name} error: ${err.message}`, 'error');
    });
    client.on('reconnecting', (ms) => logger.info(`[REDIS] ${name} reconnecting in ${ms}ms...`));
    client.on('end', () => logger.warn(`[REDIS] ${name} connection closed`));

    return client;
};

const connectRedis = async () => {
    try {
        redisClient = createClient('CacheClient', { enableReadyCheck: true });
        bullRedisClient = createClient('QueueClient', { maxRetriesPerRequest: null });

        redisClient.once('ready', async () => {
            try {
                const info = await redisClient.info('server');
                const versionMatch = info.match(/redis_version:([0-9\.]+)/);
                const version = versionMatch ? versionMatch[1] : 'unknown';
                logger.info(`[REDIS] Server version detected: ${version}`);
            } catch (err) {}
        });

        return { redisClient, bullRedisClient };
    } catch (err) {
        logger.error(`[REDIS] Fatal bridge failure: ${err.message}`);
        throw err;
    }
};

const getRedisClient = () => redisClient;
const getBullRedisClient = () => bullRedisClient;

const isRedisConnected = () => {
    return redisClient && redisClient.status === 'ready';
};

const isQueueConnected = () => {
    return bullRedisClient && bullRedisClient.status === 'ready';
};

module.exports = { 
    connectRedis, 
    createClient,
    getRedisClient, 
    getBullRedisClient,
    isRedisConnected,
    isQueueConnected
};
