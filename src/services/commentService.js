const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { getIO, EVENTS } = require('../socket');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const AppError = require('../utils/appError');

const truncate = (text, max = 100) =>
  text.length > max ? text.substring(0, max) + '...' : text;

const { cacheManager } = require('../middleware/cacheMiddleware');

const getTaskComments = async (taskId) => {
  const task = await Task.findById(taskId);
  const workspaceId = task?.workspaceId || 'global';
  
  const cacheKey = cacheManager.generateKey(workspaceId, 'comment', taskId);
  const legacyKey = `task_comments:${taskId}`;

  const cached = await cacheManager.getWithFallback(cacheKey, legacyKey);
  if (cached) {
    logger.info(`[MEMORY GRID] Discussion signals retrieved for mission: ${taskId}`);
    return { comments: cached, source: 'memory_grid' };
  }

  const comments = await Comment.find({ task: taskId })
    .sort('createdAt')
    .populate('user', 'name email');

  await cacheManager.set(cacheKey, comments);

  return { comments, source: 'primary_database' };
};

const addComment = async (user, taskId, content) => {
  const task = await Task.findById(taskId).populate('project');
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const workspaceId = task.workspaceId || user.workspaceId;

  const comment = await Comment.create({
    task: taskId,
    user: user._id,
    content,
    type: 'user_comment',
  });

  await cacheManager.invalidate(workspaceId, `comment:${taskId}`);
  await getRedisClient().del(`task_comments:${taskId}`).catch(() => {});

  const snippet = truncate(content);
  const notifiedUsers = new Set([user._id.toString()]);

  const members = await Task.db.model('User').find({ workspaceId: user.workspaceId });

  for (const member of members) {
    if (notifiedUsers.has(member._id.toString())) continue;

    const escapedName = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionRegex = new RegExp(`@${escapedName}\\b`, 'i');

    if (mentionRegex.test(content)) {
      const notification = await Notification.create({
        recipient: member._id,
        sender: user._id,
        type: 'COMMENT_ADDED',
        title: user.name,
        message: snippet,
        link: `/task/${task._id}`,
        workspaceId: user.workspaceId,
      });

      try {
        getIO().to(member._id.toString()).emit(EVENTS.NOTIFICATION_RECEIVED, notification);
      } catch (err) {}

      notifiedUsers.add(member._id.toString());
    }
  }

  if (task.assignedUser && !notifiedUsers.has(task.assignedUser.toString())) {
    const notification = await Notification.create({
      recipient: task.assignedUser,
      sender: user._id,
      type: 'COMMENT_ADDED',
      title: user.name,
      message: snippet,
      link: `/task/${task._id}`,
      workspaceId: user.workspaceId,
    });

    try {
      getIO().to(task.assignedUser.toString()).emit(EVENTS.NOTIFICATION_RECEIVED, notification);
    } catch (err) {}
  }

  const populatedComment = await Comment.findById(comment._id).populate('user', 'name email');

  try {
    const io = getIO();
    io.to(taskId.toString()).emit(EVENTS.NEW_SIGNAL, populatedComment);
  } catch (err) {
    logger.warn(`[REAL-TIME HUB] Failed to broadcast signal for mission ${taskId}: ${err.message}`);
  }

  return populatedComment;
};

const logActivity = async (taskId, userId, content) => {
  try {
    await Comment.create({
      task: taskId,
      user: userId,
      content,
      type: 'system_log',
    });

    const task = await Task.findById(taskId);
    const workspaceId = task?.workspaceId || 'global';
    await cacheManager.invalidate(workspaceId, `comment:${taskId}`);
    await getRedisClient().del(`task_comments:${taskId}`).catch(() => {});
  } catch (err) {
    logger.error(`[ACTIVITY-LOG] Failed to log system activity: ${err.message}`);
  }
};

module.exports = {
  getTaskComments,
  addComment,
  logActivity
};
