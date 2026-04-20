const taskService = require('../services/taskService');
const catchAsync = require('../utils/catchAsync');

// Update task status and log activity.
exports.updateTaskStatus = catchAsync(async (req, res, next) => {
  const { taskId, status } = req.body;
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
  const { taskId, blocked, reason } = req.body;
  const task = await taskService.toggleTaskBlockage(req.user, taskId, blocked, reason);
  res.status(200).json({ status: 'success', data: { task } });
});
