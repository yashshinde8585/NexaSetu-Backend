const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const { connectRedis, getRedisClient } = require('./src/config/redis');
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
const {
  initMagicBarQueue,
  initMagicBarWorker,
} = require('./src/jobs/magicBarQueue');
const { initCronQueue, initCronWorker } = require('./src/jobs/cronQueue');
const workerManager = require('./src/utils/workerManager');
const http = require('http');
const mongoose = require('mongoose');

async function bootstrap() {
  try {
    logger.info(`[Startup] Starting backend (${config.env})`);

    const connectDB = require('./src/config/db');
    const infraPromise = Promise.all([connectRedis(), connectDB()]);

    initOrchestratorQueue();
    initAiExtractionQueue();
    initMagicBarQueue();
    initCronQueue();
    await initStorageQueue();
    logger.info('[Queues] All 5 queues registered');

    if (process.env.RUN_WORKERS === 'true') {
      initOrchestratorWorker();
      initAiExtractionWorker();
      initStorageWorker();
      initMagicBarWorker();
      initCronWorker();
      logger.info('[Workers] All 5 workers started');
    }

    await infraPromise;

    const app = require('./src/app');
    const socketIO = require('./src/socket');
    const cronService = require('./src/services/cronService');

    const server = http.createServer(app);

    server.timeout = 30000;
    server.headersTimeout = 31000;
    server.keepAliveTimeout = 5000;
    logger.debug('[Startup] HTTP server timeouts configured');

    socketIO.init(server);
    cronService.start();

    server.listen(config.port, () => {
      logger.info(`[Server] Listening on port ${config.port} (${config.env})`);
    });

    const shutdown = async (signal) => {
      logger.info(`[Shutdown] Received ${signal}, closing connections...`);

      server.close(async () => {
        try {
          await socketIO.close();
          await workerManager.shutdown();

          await mongoose.connection.close();
          const redis = getRedisClient();
          if (redis) await redis.quit();

          logger.info('[Shutdown] All connections closed');
          process.exit(0);
        } catch (err) {
          logger.error(`[Shutdown] Cleanup failed: ${err.message}`);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('[Shutdown] Force exit after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error(`[Startup] Bootstrap failed: ${err.message}`);
    process.exit(1);
  }
}

const { notify } = require('./src/utils/notify');

process.on('unhandledRejection', (reason, promise) => {
  logger.error(
    '[UNHANDLED-REJECTION] Promise rejection unhandled: %s',
    reason?.stack || reason
  );
  notify('CRITICAL', 'Unhandled Rejection detected', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  }).catch((err) => {
    logger.error('Failed to send unhandled rejection alert: %s', err.message);
  });
});

process.on('uncaughtException', async (err) => {
  await notify('CRITICAL', `Uncaught Exception: ${err.message}`, {
    stack: err.stack,
  });
  process.exit(1);
});

bootstrap();
