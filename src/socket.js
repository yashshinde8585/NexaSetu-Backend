const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

let io;

/**
 * Initializes the Socket.io signal hub and attaches it to the existing HTTP server.
 * Implements the Redis Pub/Sub adapter for flawlessly distributed horizontal scaling.
 */
const init = (server) => {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6380';
  
  // 🧭 Initializing Independent Mission Frequencies
  const pubOptions = { maxRetriesPerRequest: null };
  const pubClient = new Redis(redisUrl, pubOptions);
  const subClient = new Redis(redisUrl, pubOptions);

  // 📡 High-Density Signal Shielding
  let lastSignalError = 0;
  const SIGNAL_THROTTLE = 30000;

  pubClient.on('error', (err) => {
      const now = Date.now();
      if (now - lastSignalError > SIGNAL_THROTTLE) {
          console.warn('[SIGNAL HUB] Hub disconnected (Retrying)...');
          lastSignalError = now;
      }
  });
  subClient.on('error', (err) => {
      // Shared throttle with publisher to minimize log noise
  });

  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'development' 
        ? true 
        : process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Attach Scaling Adapter
  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket) => {
    console.log(`[REAL-TIME HUB] New strategist connected: ${socket.id}`);

    // Join a specific mission (task) room for localized signaling
    socket.on('join_task', (taskId) => {
      socket.join(taskId);
      console.log(`[SIGNAL ROUTING] Strategist ${socket.id} joined mission room: ${taskId}`);
    });

    // Handle strategist departure
    socket.on('disconnect', () => {
      console.log(`[REAL-TIME HUB] Strategist disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Retrieves the active signal hub instance for use in controllers.
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io hub has not been initialized. Critical telemetry failure.');
  }
  return io;
};

module.exports = { init, getIO };
