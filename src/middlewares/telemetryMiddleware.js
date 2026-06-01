const logger = require('../utils/logger');

// Middleware to track request execution time and memory usage delta
const performanceTracker = (req, res, next) => {
  const start = process.hrtime();
  const startMemory = process.memoryUsage().heapUsed;

  // Log telemetry data after the response is sent to the client
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationMs = (duration[0] * 1000 + duration[1] / 1000000).toFixed(2);
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDiff = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);

    const logMessage = `[TELEMETRY] ${req.method} ${req.originalUrl} - Role: ${req.user?.role || 'ANON'} - ${durationMs}ms - MemoryDelta: ${memoryDiff}MB`;

    // Warn if request processing exceeds 500ms threshold
    if (durationMs > 500) {
      logger.warn(`${logMessage} [SLOW_REQUEST]`);
    } else {
      logger.info(logMessage);
    }
  });

  next();
};

module.exports = performanceTracker;
