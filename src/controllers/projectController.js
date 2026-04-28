const projectService = require('../services/projectService');
const catchAsync = require('../utils/catchAsync');
const ResponseBuilder = require('../utils/responseBuilder');
const { invalidateCache } = require('../middleware/cacheMiddleware');

exports.createProject = catchAsync(async (req, res, next) => {
  const project = await projectService.createProject(req.user, req.body);
  // Data Consistency: Invalidate project cache after creation.
  await invalidateCache(req.user.workspaceId, '*project*');
  return ResponseBuilder.success(res, { project }, 201);
});

exports.getProjects = catchAsync(async (req, res, next) => {
  const { page, limit } = req.query;
  const result = await projectService.getProjects(req.user, page, limit);
  
  return ResponseBuilder.success(res, {
    results: result.projects.length,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.total / result.limit)
    },
    data: { projects: result.projects },
  });
});

exports.getProject = catchAsync(async (req, res, next) => {
  const project = await projectService.getProject(req.user, req.params.id);
  return ResponseBuilder.success(res, { project });
});

exports.getProjectAnalytics = catchAsync(async (req, res, next) => {
  const { sprintId } = req.query;
  const { id } = req.params;
  const data = await projectService.getProjectAnalytics(req.user, id, sprintId);
  return ResponseBuilder.success(res, data);
});

exports.updateProject = catchAsync(async (req, res, next) => {
  const project = await projectService.updateProject(req.user, req.params.id, req.body);
  await invalidateCache(req.user.workspaceId, '*project*');
  return ResponseBuilder.success(res, { project });
});
