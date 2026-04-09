const logger = require('../utils/logger');

/**
 * Performance Tracking Middleware
 * Monitors execution time and memory usage for API requests.
 */
const performanceTracker = (req, res, next) => {
  const start = process.hrtime();
  const startMemory = process.memoryUsage().heapUsed;

  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationMs = (duration[0] * 1000 + duration[1] / 1000000).toFixed(2);
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDiff = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);

    const logMessage = `[TELEMETRY] ${req.method} ${req.originalUrl} - Role: ${req.user?.role || 'ANON'} - ${durationMs}ms - MemoryDelta: ${memoryDiff}MB`;
    
    if (durationMs > 500) {
      logger.warn(`${logMessage} [SLOW_REQUEST]`);
    } else {
      logger.info(logMessage);
    }
  });

  next();
};

module.exports = performanceTracker;
