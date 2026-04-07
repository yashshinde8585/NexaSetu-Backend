const Comment = require('../models/Comment');
const Task = require('../models/Task');
const catchAsync = require('../utils/catchAsync');
const Notification = require('../models/Notification');
const { getIO } = require('../socket');
const { cacheGet, cacheSet, cacheDel } = require('../utils/redisCache');

/** Truncates text to 100 chars with an ellipsis if needed. */
const truncate = (text, max = 100) =>
  text.length > max ? text.substring(0, max) + '...' : text;

// Fetches the chronological discussion feed and activity log for a specific mission identifier.
exports.getTaskComments = catchAsync(async (req, res, next) => {
  const { taskId } = req.params;
  const cacheKey = `task_comments:${taskId}`;

  // 🕵️ Tactical Cache Check
  const cached = await cacheGet(cacheKey);
  if (cached) {
    console.log(`[MEMORY GRID] Discussion signals retrieved for mission: ${taskId}`);
    return res.status(200).json({
      status: 'success',
      source: 'memory_grid',
      data: { comments: cached },
    });
  }

  const comments = await Comment.find({ task: taskId })
    .sort('createdAt')
    .populate('user', 'name email');

  // 📥 Sync intelligence to strategic memory grid for future readout
  await cacheSet(cacheKey, comments);

  res.status(200).json({
    status: 'success',
    source: 'primary_database',
    results: comments.length,
    data: { comments },
  });
});

// Appends a new user comment to the task feed and notifies relevant mission stakeholders.
exports.addComment = catchAsync(async (req, res, next) => {
  const { taskId } = req.params;
  const { content } = req.body;
  const cacheKey = `task_comments:${taskId}`;

  const task = await Task.findById(taskId).populate('project');
  if (!task) {
    return res.status(404).json({ status: 'fail', message: 'Mission not found' });
  }

  const comment = await Comment.create({
    task: taskId,
    user: req.user._id,
    content,
    type: 'user_comment',
  });

  // 📡 Invalidate Strategic Memory Grid
  await cacheDel(cacheKey);

  // 🔔 Notification Intelligence Engine
  const snippet = truncate(content);
  const notifiedUsers = new Set([req.user._id.toString()]);

  // 1. Notify tagged users
  const members = await Task.db.model('User').find({ workspaceId: req.user.workspaceId });

  for (const member of members) {
    if (notifiedUsers.has(member._id.toString())) continue;

    const escapedName = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionRegex = new RegExp(`@${escapedName}\\b`, 'i');

    if (mentionRegex.test(content)) {
      await Notification.create({
        recipient: member._id,
        sender: req.user._id,
        type: 'COMMENT_ADDED',
        title: req.user.name,
        message: snippet,
        link: `/task/${task._id}`,
        workspaceId: req.user.workspaceId,
      });
      notifiedUsers.add(member._id.toString());
    }
  }

  // 2. Notify assignee if not already notified
  if (task.assignedUser && !notifiedUsers.has(task.assignedUser.toString())) {
    await Notification.create({
      recipient: task.assignedUser,
      sender: req.user._id,
      type: 'COMMENT_ADDED',
      title: req.user.name,
      message: snippet,
      link: `/task/${task._id}`,
      workspaceId: req.user.workspaceId,
    });
  }

  const populatedComment = await Comment.findById(comment._id).populate('user', 'name email');

  // Broadcast this signal instantly to all strategists in the mission room
  try {
    const io = getIO();
    io.to(taskId).emit('new_signal', populatedComment);
  } catch (err) {
    console.warn('[REAL-TIME HUB] Failed to broadcast signal. Strategists may experience latency.');
  }

  res.status(201).json({
    status: 'success',
    data: { comment: populatedComment },
  });
});

// Implementation for future system-level log injection
exports.logActivity = async (taskId, userId, content) => {
  try {
    await Comment.create({
      task: taskId,
      user: userId,
      content,
      type: 'system_log',
    });
  } catch (err) {
    console.error('Failed to log system activity:', err);
  }
};
