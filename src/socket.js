const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const config = require('./config/config');
const logger = require('./utils/logger');

let io;

// SOCKET EVENT CONSTANTS
const EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_TASK: 'join_task',
  LEAVE_TASK: 'leave_task',
  NEW_SIGNAL: 'new_signal',
  ERROR: 'error'
};

/**
 * Initializes the Socket.io signal hub with Redis scaling.
 * @param {http.Server} server - HTTP server instance.
 */
const init = (server) => {
  try {
    const redisUrl = config.redis.url;
    
    // Redis clients for Pub/Sub horizontal scaling
    const redisOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 15000,
      retryStrategy: (times) => Math.min(times * 100, 3000)
    };

    const pubClient = new Redis(redisUrl, redisOptions);
    const subClient = new Redis(redisUrl, redisOptions);

    pubClient.on('error', (err) => logger.error(`[SOCKET-REDIS] Publisher Error: ${err.message}`));
    subClient.on('error', (err) => logger.error(`[SOCKET-REDIS] Subscriber Error: ${err.message}`));

    io = new Server(server, {
      cors: {
        origin: config.env === 'development' ? true : config.clientUrl,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    io.adapter(createAdapter(pubClient, subClient));

    io.on(EVENTS.CONNECTION, (socket) => {
      logger.info(`[SOCKET] Client connected: ${socket.id}`);

      // Join Task room for localized updates
      socket.on(EVENTS.JOIN_TASK, (taskId) => {
        if (!taskId) return;
        socket.join(taskId);
        logger.debug(`[SOCKET] Client ${socket.id} joined task room: ${taskId}`);
      });

      // Leave Task room to prevent memory leaks
      socket.on(EVENTS.LEAVE_TASK, (taskId) => {
        if (!taskId) return;
        socket.leave(taskId);
        logger.debug(`[SOCKET] Client ${socket.id} left task room: ${taskId}`);
      });

      // Lifecycle cleanup
      socket.on(EVENTS.DISCONNECT, (reason) => {
        logger.info(`[SOCKET] Client disconnected: ${socket.id} (${reason})`);
      });

      // Generic socket error logging
      socket.on(EVENTS.ERROR, (err) => {
        logger.error(`[SOCKET] Socket error for ${socket.id}: ${err.message}`);
      });
    });

    logger.info('[SOCKET] Real-time Hub initialized and synchronized');
    return io;
  } catch (err) {
    logger.error(`[SOCKET] Initialization failed: ${err.message}`);
    throw err;
  }
};

/**
 * Retrieves the active Socket.io instance.
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io hub has not been initialized. Call init(server) first.');
  }
  return io;
};

module.exports = { init, getIO, EVENTS };
