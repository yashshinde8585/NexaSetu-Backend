const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const { connectRedis, getRedisClient } = require('./src/config/redis');
const { initOrchestratorQueue } = require('./src/queues/orchestratorQueue');
const http = require('http');
const mongoose = require('mongoose');

/**
 * PRODUCTION BOOTSTRAP SEQUENCE
 * Initializes core services in strict order to maintain operational integrity.
 */
async function bootstrap() {
  try {
    // 1. Core Memory Infrastructure
    connectRedis();
    initOrchestratorQueue();
    logger.info('[BOOTSTRAP] Redis & Queue Services online');

    // 2. Persistent Storage
    const connectDB = require('./src/config/db');
    await connectDB();

    // 3. Application Assembly
    const app = require('./src/app');
    const socketIO = require('./src/socket');
    const cronService = require('./src/services/cronService');

    const server = http.createServer(app);

    // 4. Real-time & Background Services
    socketIO.init(server);
    cronService.start();
    logger.info('[BOOTSTRAP] Real-time & Scheduled services synchronized');

    // 5. Network Entry Point
    server.listen(config.port, () => {
      logger.info(`[NEXA-SETU] API Server listening on port ${config.port} [${config.env}]`);
    });

    /**
     * GRACEFUL SHUTDOWN HANDLER
     */
    const shutdown = async (signal) => {
      logger.info(`[SHUTDOWN] Signal ${signal} detected. Purging resources...`);
      
      server.close(async () => {
        try {
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

// System-wide error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('[FATAL] Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (err) => {
  logger.error(`[FATAL] Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

bootstrap();
