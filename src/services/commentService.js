const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { getIO, EVENTS } = require('../socket');
const { cacheGet, cacheSet, cacheDel } = require('../utils/redisCache');
const logger = require('../utils/logger');
const AppError = require('../utils/appError');

const truncate = (text, max = 100) =>
  text.length > max ? text.substring(0, max) + '...' : text;

class CommentService {
  async getTaskComments(taskId) {
    const cacheKey = `task_comments:${taskId}`;

    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.info(`[MEMORY GRID] Discussion signals retrieved for mission: ${taskId}`);
      return { comments: cached, source: 'memory_grid' };
    }

    const comments = await Comment.find({ task: taskId })
      .sort('createdAt')
      .populate('user', 'name email');

    await cacheSet(cacheKey, comments);

    return { comments, source: 'primary_database' };
  }

  async addComment(user, taskId, content) {
    const cacheKey = `task_comments:${taskId}`;

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const comment = await Comment.create({
      task: taskId,
      user: user._id,
      content,
      type: 'user_comment',
    });

    await cacheDel(cacheKey);

    const snippet = truncate(content);
    const notifiedUsers = new Set([user._id.toString()]);

    const members = await Task.db.model('User').find({ workspaceId: user.workspaceId });

    for (const member of members) {
      if (notifiedUsers.has(member._id.toString())) continue;

      const escapedName = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mentionRegex = new RegExp(`@${escapedName}\\b`, 'i');

      if (mentionRegex.test(content)) {
        await Notification.create({
          recipient: member._id,
          sender: user._id,
          type: 'COMMENT_ADDED',
          title: user.name,
          message: snippet,
          link: `/task/${task._id}`,
          workspaceId: user.workspaceId,
        });
        notifiedUsers.add(member._id.toString());
      }
    }

    if (task.assignedUser && !notifiedUsers.has(task.assignedUser.toString())) {
      await Notification.create({
        recipient: task.assignedUser,
        sender: user._id,
        type: 'COMMENT_ADDED',
        title: user.name,
        message: snippet,
        link: `/task/${task._id}`,
        workspaceId: user.workspaceId,
      });
    }

    const populatedComment = await Comment.findById(comment._id).populate('user', 'name email');

    try {
      const io = getIO();
      io.to(taskId.toString()).emit(EVENTS.NEW_SIGNAL, populatedComment);
    } catch (err) {
      logger.warn(`[REAL-TIME HUB] Failed to broadcast signal for mission ${taskId}: ${err.message}`);
    }

    return populatedComment;
  }

  async logActivity(taskId, userId, content) {
    try {
      await Comment.create({
        task: taskId,
        user: userId,
        content,
        type: 'system_log',
      });
    } catch (err) {
      logger.error(`[ACTIVITY-LOG] Failed to log system activity: ${err.message}`);
    }
  }
}

module.exports = new CommentService();
