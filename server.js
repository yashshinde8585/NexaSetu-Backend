const http = require('http');
const socketIO = require('./src/socket');
const app = require('./src/app');
const dotenv = require('dotenv');
const connectDB = require('./src/config/db');
const { connectRedis } = require('./src/config/redis');
const cronService = require('./src/services/cronService');

dotenv.config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Setup real-time communication hub
socketIO.init(server);

// Initialize Redis cache
connectRedis();

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'NexaSetu Central Hub',
    timestamp: new Date().toISOString()
  });
});

// Start database connection and server
connectDB().then(() => {
  cronService.start();
  server.listen(PORT, () => {
    console.log(`[NEXA-SETU] API Server running on http://localhost:${PORT}`);
    console.log(`[NEXA-SETU] Real-Time Signal Hub initialized`);
  });
});

/**
 * Graceful Shutdown Protocol
 * Closes connections cleanly to prevent data corruption.
 */
const gracefulShutdown = () => {
  console.log('[SHUTDOWN] Closing server and dependencies...');
  server.close(async () => {
    console.log('[SHUTDOWN] HTTP server closed.');
    const mongoose = require('mongoose');
    const { getRedisClient } = require('./src/config/redis');
    
    await mongoose.connection.close();
    console.log('[SHUTDOWN] Database connection closed.');
    
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
        await redis.quit();
        console.log('[SHUTDOWN] Redis connection closed.');
    }
    
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Global Exception and Rejection Listeners
 * Prevents asynchronous errors from crashing the process silently.
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});
