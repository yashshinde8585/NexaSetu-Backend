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
    logger.info('[WORKER-BOOT] Initializing background worker process...');

    const connectDB = require('./src/config/db');

    await Promise.all([connectRedis(), connectDB()]);

    logger.info('[WORKER-BOOT] Infrastructure connected.');

    initOrchestratorQueue();
    initAiExtractionQueue();
    await initStorageQueue();

    initOrchestratorWorker();
    initAiExtractionWorker();
    initStorageWorker();

    logger.info(
      '[WORKER-BOOT] All workers are operational and listening for jobs.'
    );

    const shutdown = async (signal) => {
      logger.info(
        `[WORKER-SHUTDOWN] Signal ${signal} detected. Closing workers...`
      );

      try {
        await workerManager.shutdown();

        await mongoose.connection.close();
        const redis = getBullRedisClient();
        if (redis) await redis.quit();

        logger.info('[WORKER-SHUTDOWN] Cleanup complete. Exit 0.');
        process.exit(0);
      } catch (err) {
        logger.error(`[WORKER-SHUTDOWN] Cleanup failed: ${err.message}`);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error(`[WORKER-FATAL] Startup failed: ${err.message}`);
    process.exit(1);
  }
}

const { getBullRedisClient } = require('./src/config/redis');

startWorker();
