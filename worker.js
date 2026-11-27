const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const { connectRedis, getRedisClient } = require('./src/config/redis');
const mongoose = require('mongoose');

const {
  initOrchestratorQueue,
  initOrchestratorWorker,
} = require('./src/jobs/orchestratorQueue');
const {
  initAiExtractionQueue,
  initAiExtractionWorker,
} = require('./src/jobs/aiExtractionQueue');
const {
  initStorageQueue,
  initStorageWorker,
} = require('./src/jobs/storageQueue');

const workerManager = require('./src/utils/workerManager');

async function startWorker() {
  try {
    logger.info('[Worker] Starting background worker process');

    const connectDB = require('./src/config/db');

    await Promise.all([connectRedis(), connectDB()]);

    logger.debug('[Worker] Database and Redis connected');

    initOrchestratorQueue();
    initAiExtractionQueue();
    await initStorageQueue();
    logger.info('[Queues] Worker queues registered');

    initOrchestratorWorker();
    initAiExtractionWorker();
    initStorageWorker();

    logger.info('[Workers] Background workers started');

    const shutdown = async (signal) => {
      logger.info(`[Shutdown] Received ${signal}, closing workers...`);

      try {
        await workerManager.shutdown();

        await mongoose.connection.close();
        const redis = getRedisClient();
        if (redis) await redis.quit();

        logger.info('[Shutdown] Worker cleanup complete');
        process.exit(0);
      } catch (err) {
        logger.error(`[Shutdown] Worker cleanup failed: ${err.message}`);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error(`[Worker] Startup failed: ${err.message}`);
    process.exit(1);
  }
}

const { getBullRedisClient } = require('./src/config/redis');

startWorker();
