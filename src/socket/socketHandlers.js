/**
 * Socket.IO Connection Event Handlers
 * Decouples message payloads, database model lookups, and security policies from socket transport setup.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { canAccessResource } = require('../utils/authHelpers');
const { runWithContext } = require('../utils/context');

const EVENTS = {
  JOIN_TASK: 'join_task',
  LEAVE_TASK: 'leave_task',
  JOIN_PROJECT: 'join_project',
  LEAVE_PROJECT: 'leave_project',
  JOIN_WORKSPACE: 'join_workspace',
  LEAVE_WORKSPACE: 'leave_workspace',
  ERROR: 'error',
};

const wrapSocketHandler = (socket, eventName, handler) => {
  return (...args) => {
    const handshakeReqId =
      socket.handshake?.headers?.['x-request-id'] ||
      socket.handshake?.auth?.requestId;
    const requestId = handshakeReqId || crypto.randomUUID();
    const store = {
      requestId,
      user: socket.user ? { id: socket.user.id, role: socket.user.role } : null,
    };
    return runWithContext(store, () => {
      logger.debug(
        `[SOCKET] Event ${eventName} received on socket ${socket.id}`
      );
      return handler(...args);
    });
  };
};

exports.registerHandlers = (socket) => {
  // 1. Join Task Room
  socket.on(
    EVENTS.JOIN_TASK,
    wrapSocketHandler(socket, EVENTS.JOIN_TASK, async (taskId) => {
      if (!taskId) return;

      try {
        const hasAccess = await canAccessResource(socket.user, taskId, 'task');
        if (!hasAccess) {
          logger.warn(
            `[SOCKET-SECURITY] Unauthorized room join attempt: user=${socket.user.id} room=task:${taskId}`
          );
          return socket.emit(EVENTS.ERROR, {
            message: 'Access denied to this task room.',
          });
        }

        socket.join(taskId.toString());
        logger.debug(`[SOCKET] ${socket.id} joined task room: ${taskId}`);
      } catch (err) {
        logger.error(
          `[SOCKET] Error joining task room ${taskId}: ${err.message}`
        );
        socket.emit(EVENTS.ERROR, { message: 'Failed to join task room.' });
      }
    })
  );

  // 2. Leave Task Room
  socket.on(
    EVENTS.LEAVE_TASK,
    wrapSocketHandler(socket, EVENTS.LEAVE_TASK, (taskId) => {
      if (!taskId) return;
      socket.leave(taskId.toString());
      logger.debug(`[SOCKET] ${socket.id} left task room: ${taskId}`);
    })
  );

  // 3. Join Project Room
  socket.on(
    EVENTS.JOIN_PROJECT,
    wrapSocketHandler(socket, EVENTS.JOIN_PROJECT, async (projectId) => {
      if (!projectId) return;

      try {
        const hasAccess = await canAccessResource(
          socket.user,
          projectId,
          'project'
        );
        if (!hasAccess) {
          logger.warn(
            `[SOCKET-SECURITY] Unauthorized room join attempt: user=${socket.user.id} room=project:${projectId}`
          );
          return socket.emit(EVENTS.ERROR, {
            message: 'Access denied to this project room.',
          });
        }

        socket.join(projectId.toString());
        logger.debug(`[SOCKET] ${socket.id} joined project room: ${projectId}`);
      } catch (err) {
        logger.error(
          `[SOCKET] Error joining project room ${projectId}: ${err.message}`
        );
        socket.emit(EVENTS.ERROR, { message: 'Failed to join project room.' });
      }
    })
  );

  // 4. Leave Project Room
  socket.on(
    EVENTS.LEAVE_PROJECT,
    wrapSocketHandler(socket, EVENTS.LEAVE_PROJECT, (projectId) => {
      if (!projectId) return;
      socket.leave(projectId.toString());
      logger.debug(`[SOCKET] ${socket.id} left project room: ${projectId}`);
    })
  );

  // 5. Join Workspace Room
  socket.on(
    EVENTS.JOIN_WORKSPACE,
    wrapSocketHandler(socket, EVENTS.JOIN_WORKSPACE, async (workspaceId) => {
      if (!workspaceId) return;

      // Ensure user belongs to this workspace
      const userWorkspaceId = socket.user?.workspaceId?.toString() || '';
      if (!userWorkspaceId || userWorkspaceId !== workspaceId.toString()) {
        logger.warn(
          `[SOCKET-SECURITY] Unauthorized workspace room join attempt: user=${socket.user.id} room=workspace:${workspaceId}`
        );
        return socket.emit(EVENTS.ERROR, {
          message: 'Access denied to this workspace room.',
        });
      }

      socket.join(`workspace:${workspaceId}`);
      logger.debug(
        `[SOCKET] ${socket.id} joined workspace room: ${workspaceId}`
      );
    })
  );

  // 6. Leave Workspace Room
  socket.on(
    EVENTS.LEAVE_WORKSPACE,
    wrapSocketHandler(socket, EVENTS.LEAVE_WORKSPACE, (workspaceId) => {
      if (!workspaceId) return;
      socket.leave(`workspace:${workspaceId}`);
      logger.debug(`[SOCKET] ${socket.id} left workspace room: ${workspaceId}`);
    })
  );
};
