const Redis = require('ioredis');
const config = require('./config');
const logger = require('../utils/logger');

let redisClient;
let bullRedisClient;

const logThrottle = {
  lastError: 0,
  lastDegraded: 0,
  errorCount: 0,
  INTERVAL: 60000,
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
    throttleLog(
      'lastError',
      `[Redis] ${clientName} connection failed after ${times} attempts. Check REDIS_URL.`,
      'error'
    );
  } else {
    logger.debug(`[Redis] ${clientName} retry attempt ${times}`);
  }
  return delay;
};

const createClient = (name, options = {}) => {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: 20,
    connectTimeout: 15000,
    retryStrategy: getRetryStrategy(name),
    ...options,
  });

  client.on('connect', () => logger.debug(`[Redis] ${name} connected`));
  client.on('ready', () => logger.debug(`[Redis] ${name} ready`));
  client.on('error', (err) => {
    throttleLog('lastError', `[Redis] ${name} error: ${err.message}`, 'error');
  });
  client.on('reconnecting', (ms) =>
    logger.warn(`[Redis] ${name} reconnecting in ${ms}ms`)
  );
  client.on('end', () => logger.warn(`[Redis] ${name} connection closed`));

  return client;
};

const connectRedis = async () => {
  try {
    redisClient = createClient('CacheClient', { enableReadyCheck: true });
    bullRedisClient = createClient('QueueClient', {
      maxRetriesPerRequest: null,
    });

    redisClient.once('ready', async () => {
      try {
        const info = await redisClient.info('server');
        const versionMatch = info.match(/redis_version:([0-9\.]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        logger.info(`[Redis] Connection ready (v${version})`);
      } catch (err) {
        logger.info('[Redis] Connection ready');
      }
    });

    return { redisClient, bullRedisClient };
  } catch (err) {
    logger.error(`[Redis] Initialization failed: ${err.message}`);
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

const withTimeout = async (promise, timeoutMs = 2000, fallback = null) => {
  let timeout;
  const timeoutPromise = new Promise((resolve) => {
    timeout = setTimeout(() => {
      logger.warn(
        `[REDIS-TIMEOUT] Operation timed out after ${timeoutMs}ms. Falling back.`
      );
      resolve(fallback);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeout);
    return result;
  } catch (err) {
    clearTimeout(timeout);
    logger.error(`[REDIS-ERROR] Operation failed: ${err.message}`);
    return fallback;
  }
};

module.exports = {
  connectRedis,
  createClient,
  getRedisClient,
  getBullRedisClient,
  isRedisConnected,
  isQueueConnected,
  withTimeout,
};
