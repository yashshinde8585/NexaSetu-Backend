const projectService = require('../services/projectService');
const catchAsync = require('../utils/catchAsync');

// Initializes a new project entity within the user's workspace.
exports.createProject = catchAsync(async (req, res, next) => {
  const project = await projectService.createProject(req.user, req.body);
  res.status(201).json({ status: 'success', data: { project } });
});

// Retrieves all projects the current user is authorized to manage or view.
exports.getProjects = catchAsync(async (req, res, next) => {
  const { page, limit } = req.query;
  const result = await projectService.getProjects(req.user, page, limit);
  
  res.status(200).json({
    status: 'success',
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

// Fetches specific project telemetry ensuring strict workspace containment.
exports.getProject = catchAsync(async (req, res, next) => {
  const project = await projectService.getProject(req.user, req.params.id);
  res.status(200).json({ status: 'success', data: { project } });
});

// Aggregates task matrices to generate robust health and completion metrics.
exports.getProjectAnalytics = catchAsync(async (req, res, next) => {
  const { sprintId } = req.query;
  const { id } = req.params;
  const data = await projectService.getProjectAnalytics(req.user, id, sprintId);
  res.status(200).json({ status: 'success', data });
});

// Modifies top-level project metadata with strict role-based access validation.
exports.updateProject = catchAsync(async (req, res, next) => {
  const project = await projectService.updateProject(req.user, req.params.id, req.body);
  res.status(200).json({ status: 'success', data: { project } });
});
