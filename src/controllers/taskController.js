const taskService = require('../services/taskService');
const storageService = require('../services/storageService');
const catchAsync = require('../utils/catchAsync');

// Update task status and log activity.
exports.updateTaskStatus = catchAsync(async (req, res, next) => {
  const taskId = req.params.id || req.body.taskId;
  const { status } = req.body;
  const task = await taskService.updateTaskStatus(req.user, taskId, status);
  res.status(200).json({ status: 'success', data: { task } });
});

// Create a new task.
exports.createTask = catchAsync(async (req, res, next) => {
  const task = await taskService.createTask(req.user, req.body);
  res.status(201).json({ status: 'success', data: { task } });
});

// Retrieve tasks for a project.
exports.getTasks = catchAsync(async (req, res, next) => {
  const { projectId } = req.params;
  const { sprintId, page, limit } = req.query;
  const result = await taskService.getTasks(req.user, projectId, sprintId, page, limit);

  res.status(200).json({
    status: 'success',
    results: result.tasks.length,
    pagination: {
      total: result.totalTasks,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.totalTasks / result.limit)
    },
    data: { tasks: result.tasks },
  });
});

// Retrieve a task by ID.
exports.getTaskById = catchAsync(async (req, res, next) => {
  const task = await taskService.getTaskById(req.user, req.params.id);
  res.status(200).json({ status: 'success', data: { task } });
});

// Update task details and manage lifecycle.
exports.updateTask = catchAsync(async (req, res, next) => {
  const task = await taskService.updateTask(req.user, req.params.id, req.body);
  res.status(200).json({ status: 'success', data: { task } });
});

// Retrieve tasks assigned to the current user.
exports.getMyTasks = catchAsync(async (req, res, next) => {
  const { scope, page, limit } = req.query;
  const result = await taskService.getMyTasks(req.user, scope, page, limit);

  res.status(200).json({
    status: 'success',
    results: result.tasks.length,
    pagination: {
      total: result.totalTasks,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.totalTasks / result.limit)
    },
    data: { tasks: result.tasks },
  });
});

// Toggle task blockage status and log activity.
exports.toggleTaskBlockage = catchAsync(async (req, res, next) => {
  const taskId = req.params.id || req.body.taskId;
  const { blocked, reason } = req.body;
  const task = await taskService.toggleTaskBlockage(req.user, taskId, blocked, reason);
  res.status(200).json({ status: 'success', data: { task } });
});

// Delete a task and cleanup resources.
exports.deleteTask = catchAsync(async (req, res, next) => {
  await taskService.deleteTask(req.user, req.params.id);
  res.status(204).json({ status: 'success', data: null });
});

// Generate a signed upload URL for attachments.
exports.getSignedUploadUrl = catchAsync(async (req, res, next) => {
  const { workspaceId, projectId, taskId, fileName, fileType } = req.body;
  
  // Hardened validation: user must belong to workspace
  if (req.user.workspaceId.toString() !== workspaceId.toString()) {
    return res.status(403).json({ status: 'fail', message: 'Unauthorized workspace access' });
  }

  const data = await storageService.getSignedUploadUrl(
    workspaceId, 
    projectId, 
    taskId || 'new', 
    fileName, 
    fileType,
    req.body.fileSize || 0
  );
  
  res.status(200).json({ status: 'success', data });
});
