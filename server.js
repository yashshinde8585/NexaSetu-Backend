const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const { connectRedis, getRedisClient } = require('./src/config/redis');
const { initOrchestratorQueue, initOrchestratorWorker } = require('./src/queues/orchestratorQueue');
const { initAiExtractionQueue, initAiExtractionWorker } = require('./src/queues/aiExtractionQueue');
const { initStorageQueue, initStorageWorker } = require('./src/queues/storageQueue');
const { initMagicBarQueue, initMagicBarWorker } = require('./src/queues/magicBarQueue');
const { initCronQueue, initCronWorker } = require('./src/queues/cronQueue');
const workerManager = require('./src/utils/workerManager');
const http = require('http');
const mongoose = require('mongoose');

async function bootstrap() {
  try {
    logger.info(`[BOOTSTRAP] Initializing services in ${config.env} mode...`);

    const connectDB = require('./src/config/db');
    const infraPromise = Promise.all([
      connectRedis(),
      connectDB(),
    ]);

    initOrchestratorQueue();
    initAiExtractionQueue();
    initMagicBarQueue();
    initCronQueue();
    await initStorageQueue();

    if (process.env.RUN_WORKERS === 'true') {
      logger.info('[BOOTSTRAP] Initializing Workers in API process (RUN_WORKERS=true)');
      initOrchestratorWorker();
      initAiExtractionWorker();
      initStorageWorker();
      initMagicBarWorker();
      initCronWorker();
    }

    logger.info('[BOOTSTRAP] Redis & Queue Services initialized');

    await infraPromise;

    logger.info('[BOOTSTRAP] Database & Cache Connectivity established');

    const app = require('./src/app');
    const socketIO = require('./src/socket');
    const cronService = require('./src/services/cronService');

    const server = http.createServer(app);
    
    server.timeout = 30000;
    server.headersTimeout = 31000;
    server.keepAliveTimeout = 5000;
    logger.info('[BOOTSTRAP] Network timeouts enforced');

    socketIO.init(server);
    cronService.start();
    logger.info('[BOOTSTRAP] Real-time & Scheduled services synchronized');

    server.listen(config.port, () => {
      logger.info(`[NEXA-SETU] API Server listening on port ${config.port} [${config.env}]`);
    });

    const shutdown = async (signal) => {
      logger.info(`[SHUTDOWN] Signal ${signal} detected. Purging resources...`);
      
      server.close(async () => {
        try {
          await workerManager.shutdown();
          
          await mongoose.connection.close();
          const redis = getRedisClient();
          if (redis) await redis.quit();
          
          logger.info('[SHUTDOWN] All connections terminated. Goodbye.');
          process.exit(0);
        } catch (err) {
          logger.error(`[SHUTDOWN] Cleanup failure: ${err.message}`);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('[SHUTDOWN] Force exit triggered after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error(`[FATAL] Bootstrap failed: ${err.message}`);
    process.exit(1);
  }
}

const { notify } = require('./src/utils/notify');

process.on('unhandledRejection', (reason, promise) => {
  notify('CRITICAL', 'Unhandled Rejection detected', { reason: reason?.message || reason, stack: reason?.stack });
  if (config.isProduction) {
    process.emit('SIGTERM');
  }
});

process.on('uncaughtException', async (err) => {
  await notify('CRITICAL', `Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

bootstrap();
