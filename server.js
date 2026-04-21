const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const { connectRedis, getRedisClient } = require('./src/config/redis');
const { initOrchestratorQueue } = require('./src/queues/orchestratorQueue');
const http = require('http');
const mongoose = require('mongoose');

/**
 * Production-grade bootstrap sequence.
 * Services are initialized in a specific order to ensure data integrity and connectivity.
 */
async function bootstrap() {
  try {
    // Initialize memory-store first for rate-limiting and queues
    connectRedis();
    initOrchestratorQueue();
    logger.info('[BOOTSTRAP] Redis & Queue Services online');

    // Connect to database before starting application logic
    const connectDB = require('./src/config/db');
    await connectDB();

    // 3. Application Assembly
    const app = require('./src/app');
    const socketIO = require('./src/socket');
    const cronService = require('./src/services/cronService');

    const server = http.createServer(app);
    
    // Network safeguards to prevent resource exhaustion during slow attacks
    server.timeout = 30000;
    server.headersTimeout = 31000;
    server.keepAliveTimeout = 5000;
    logger.info('[BOOTSTRAP] Network timeouts enforced');

    // Synchronize real-time communications and automated background tasks
    socketIO.init(server);
    cronService.start();
    logger.info('[BOOTSTRAP] Real-time & Scheduled services synchronized');

    // Start listening only after all critical services are healthy
    server.listen(config.port, () => {
      logger.info(`[NEXA-SETU] API Server listening on port ${config.port} [${config.env}]`);
    });

    /**
     * Graceful termination to prevent data corruption and ensure connection cleanup.
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
