const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { Emitter } = require('@socket.io/redis-emitter');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const config = require('./config/config');
const logger = require('./utils/logger');
const { createClient } = require('./config/redis');
const { canAccessResource } = require('./utils/authHelpers');

let io;
let emitter;

const EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_TASK: 'join_task',
  LEAVE_TASK: 'leave_task',
  JOIN_PROJECT: 'join_project',
  LEAVE_PROJECT: 'leave_project',
  NEW_SIGNAL: 'new_signal',
  TASK_UPDATED: 'task_updated',
  AGENT_ACTIVITY: 'AGENT_ACTIVITY',
  AI_EXTRACTION_COMPLETE: 'AI_EXTRACTION_COMPLETE',
  MAGICBAR_COMPLETE: 'MAGICBAR_COMPLETE',
  NOTIFICATION_RECEIVED: 'NOTIFICATION_RECEIVED',
  ERROR: 'error'
};

const init = (server) => {
  try {
    const pubClient = createClient('SocketPub', { maxRetriesPerRequest: null, enableReadyCheck: true });
    const subClient = createClient('SocketSub', { maxRetriesPerRequest: null, enableReadyCheck: true });
    
    emitter = new Emitter(pubClient);

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

    io.use(async (socket, next) => {
      try {
        const cookies = socket.handshake.headers.cookie;
        const token = cookies ? cookie.parse(cookies).accessToken : null;
        const authHeader = socket.handshake.auth?.token || socket.handshake.headers.authorization;
        const finalToken = token || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader);

        if (!finalToken) {
          logger.warn(`[SOCKET-AUTH] Connection denied: Missing token for ${socket.id}`);
          return next(new Error('Authentication failed: Missing token'));
        }

        const decoded = jwt.verify(finalToken, config.jwt.secret);
        if (!decoded.id) return next(new Error('Authentication failed: Invalid token payload'));
        
        socket.user = decoded;
        next();
      } catch (err) {
        logger.error(`[SOCKET-AUTH] Token validation failed: ${err.message}`);
        return next(new Error('Authentication failed: Invalid session'));
      }
    });

    io.on(EVENTS.CONNECTION, (socket) => {
      logger.info(`[SOCKET] Authenticated: ${socket.user?.id || socket.id}`);

      if (socket.user?.id) {
        socket.join(socket.user.id.toString());
      }

      socket.on(EVENTS.JOIN_TASK, async (taskId) => {
        if (!taskId) return;
        
        const hasAccess = await canAccessResource(socket.user, taskId, 'task');
        if (!hasAccess) {
          logger.warn(`[SOCKET-SECURITY] Unauthorized room join attempt: user=${socket.user.id} room=task:${taskId}`);
          return socket.emit(EVENTS.ERROR, { message: 'Access denied to this task room.' });
        }

        socket.join(taskId.toString());
        logger.debug(`[SOCKET] ${socket.id} joined task room: ${taskId}`);
      });

      socket.on(EVENTS.LEAVE_TASK, (taskId) => {
        if (!taskId) return;
        socket.leave(taskId.toString());
        logger.debug(`[SOCKET] ${socket.id} left task room: ${taskId}`);
      });

      socket.on(EVENTS.JOIN_PROJECT, async (projectId) => {
        if (!projectId) return;

        const hasAccess = await canAccessResource(socket.user, projectId, 'project');
        if (!hasAccess) {
          logger.warn(`[SOCKET-SECURITY] Unauthorized room join attempt: user=${socket.user.id} room=project:${projectId}`);
          return socket.emit(EVENTS.ERROR, { message: 'Access denied to this project room.' });
        }

        socket.join(projectId.toString());
        logger.debug(`[SOCKET] ${socket.id} joined project room: ${projectId}`);
      });

      socket.on(EVENTS.LEAVE_PROJECT, (projectId) => {
        if (!projectId) return;
        socket.leave(projectId.toString());
        logger.debug(`[SOCKET] ${socket.id} left project room: ${projectId}`);
      });

      socket.on(EVENTS.DISCONNECT, (reason) => {
        logger.info(`[SOCKET] Session ended: ${socket.id} (${reason})`);
      });

      socket.on(EVENTS.ERROR, (err) => {
        logger.error(`[SOCKET] Operational error for ${socket.id}: ${err.message}`);
      });
    });

    logger.info('[SOCKET] Real-time Hub initialized with security and horizontal scaling');
    return io;
  } catch (err) {
    logger.error(`[SOCKET] Critical initialization failure: ${err.message}`);
    throw err;
  }
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io hub has not been initialized. Call init(server) first.');
  }
  return io;
};

const getEmitter = () => {
  if (emitter) return emitter;
  
  logger.info('[SOCKET] Initializing standalone Redis emitter for worker process');
  const pubClient = createClient('WorkerEmitter', { maxRetriesPerRequest: null });
  emitter = new Emitter(pubClient);
  return emitter;
};

module.exports = { init, getIO, getEmitter, EVENTS };
