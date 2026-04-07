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

// Initialize Real-Time Signal Hub
socketIO.init(server);

// Initializing Strategic Memory Grid
connectRedis();

// Tactical Health Pulse
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'NexaSetu Central Hub',
    timestamp: new Date().toISOString()
  });
});

// Connect to Database
connectDB().then(() => {
  cronService.start();
  server.listen(PORT, () => {
    console.log(`[NEXA-SETU RECON] API Server running on http://localhost:${PORT}`);
    console.log(`[NEXA-SETU RECON] Real-Time Signal Hub initialized`);
  });
});

/**
 * 📡 Mission-Safe Termination Protocol
 * Ensures all frequencies are closed cleanly to prevent data corruption or port lock-ups.
 */
const gracefulShutdown = () => {
  console.log('[RECON] Initiating Mission-Safe Shutdown...');
  server.close(async () => {
    console.log('[RECON] Signal Hub frequency closed.');
    const mongoose = require('mongoose');
    const { getRedisClient } = require('./src/config/redis');
    
    await mongoose.connection.close();
    console.log('[RECON] Primary Database frequency closed.');
    
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
        await redis.quit();
        console.log('[RECON] Strategic Memory Grid frequency closed.');
    }
    
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
