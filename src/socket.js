const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const config = require('./config/config');
const logger = require('./utils/logger');
const { createClient } = require('./config/redis');

let io;

// Events objects for real-time communication
const EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_TASK: 'join_task',
  LEAVE_TASK: 'leave_task',
  NEW_SIGNAL: 'new_signal',
  ERROR: 'error'
};

// Initialize socket.io connections to Redis for pub/sub messaging
const init = (server) => {
  try {
    const pubClient = createClient('SocketPub', { maxRetriesPerRequest: null, enableReadyCheck: true });
    const subClient = createClient('SocketSub', { maxRetriesPerRequest: null, enableReadyCheck: true });

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

      socket.on(EVENTS.JOIN_TASK, (taskId) => {
        if (!taskId) return;
        socket.join(taskId);
        logger.debug(`[SOCKET] Client ${socket.id} joined task room: ${taskId}`);
      });

      socket.on(EVENTS.LEAVE_TASK, (taskId) => {
        if (!taskId) return;
        socket.leave(taskId);
        logger.debug(`[SOCKET] Client ${socket.id} left task room: ${taskId}`);
      });

      socket.on(EVENTS.DISCONNECT, (reason) => {
        logger.info(`[SOCKET] Client disconnected: ${socket.id} (${reason})`);
      });

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

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io hub has not been initialized. Call init(server) first.');
  }
  return io;
};

module.exports = { init, getIO, EVENTS };
