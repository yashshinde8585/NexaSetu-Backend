const taskService = require('../services/taskService');
const storageService = require('../services/storageService');
const catchAsync = require('../utils/catchAsync');
const ResponseBuilder = require('../utils/responseBuilder');
const dataTransformer = require('../utils/dataTransformer');

exports.updateTaskStatus = catchAsync(async (req, res, next) => {
  const dto = dataTransformer.transform(req, ['status', 'taskId']);
  const taskId = req.params.id || dto.taskId;
  const task = await taskService.updateTaskStatus(
    req.user,
    taskId,
    dto.status,
    req
  );

  return ResponseBuilder.success(res, { task });
});

exports.createTask = catchAsync(async (req, res, next) => {
  const dto = dataTransformer.transform(req);
  const task = await taskService.createTask(req.user, dto);
  return ResponseBuilder.success(res, { task }, 201);
});

exports.getTasks = catchAsync(async (req, res, next) => {
  const { projectId } = req.params;
  const { sprintId, page, limit } = req.query;
  const result = await taskService.getTasks(
    req.user,
    projectId,
    sprintId,
    page,
    limit
  );

  return ResponseBuilder.success(res, {
    results: result.tasks.length,
    pagination: {
      total: result.totalTasks,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.totalTasks / result.limit),
    },
    data: { tasks: result.tasks },
  });
});

exports.getTaskById = catchAsync(async (req, res, next) => {
  const task = await taskService.getTaskById(req.user, req.params.id);
  return ResponseBuilder.success(res, { task });
});

exports.updateTask = catchAsync(async (req, res, next) => {
  const dto = dataTransformer.transform(req);
  const task = await taskService.updateTask(req.user, req.params.id, dto);

  return ResponseBuilder.success(res, { task });
});

exports.getMyTasks = catchAsync(async (req, res, next) => {
  const { scope, page, limit } = req.query;
  const result = await taskService.getMyTasks(req.user, scope, page, limit);

  return ResponseBuilder.success(res, {
    results: result.tasks.length,
    pagination: {
      total: result.totalTasks,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.totalTasks / result.limit),
    },
    data: { tasks: result.tasks },
  });
});

exports.toggleTaskBlockage = catchAsync(async (req, res, next) => {
  const dto = dataTransformer.transform(req, ['blocked', 'reason', 'taskId']);
  const taskId = req.params.id || dto.taskId;
  const task = await taskService.toggleTaskBlockage(
    req.user,
    taskId,
    dto.blocked,
    dto.reason
  );

  return ResponseBuilder.success(res, { task });
});

exports.updateTaskSteps = catchAsync(async (req, res, next) => {
  const { steps } = req.body;
  const task = await taskService.updateTaskSteps(
    req.user,
    req.params.id,
    steps
  );
  return ResponseBuilder.success(res, { task });
});

exports.deleteTask = catchAsync(async (req, res, next) => {
  await taskService.deleteTask(req.user, req.params.id);

  return ResponseBuilder.success(res, null, 204);
});

exports.submitTaskReview = catchAsync(async (req, res, next) => {
  const { result, notes } = req.body;
  const task = await taskService.submitTaskReview(
    req.user,
    req.params.id,
    result,
    notes
  );
  return ResponseBuilder.success(res, { task });
});

exports.getSignedUploadUrl = catchAsync(async (req, res, next) => {
  const dto = dataTransformer.transform(req);

  const userWorkspaceId = req.user?.workspaceId?.toString() || '';
  const dtoWorkspaceId = dto.workspaceId?.toString() || '';

  if (!userWorkspaceId || userWorkspaceId !== dtoWorkspaceId) {
    return ResponseBuilder.error(
      res,
      'Unauthorized workspace access',
      'FORBIDDEN',
      403
    );
  }

  const data = await storageService.getSignedUploadUrl(
    dto.workspaceId,
    dto.projectId,
    dto.taskId || 'new',
    dto.fileName,
    dto.fileType,
    dto.fileSize || 0
  );

  return ResponseBuilder.success(res, data);
});
