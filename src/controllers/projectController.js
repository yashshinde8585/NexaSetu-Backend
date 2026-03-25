const Project = require('../models/Project');
const Task = require('../models/Task');
const { calculateDelayStatus } = require('../utils/taskUtils');
const catchAsync = require('../utils/catchAsync');

// Create new project
exports.createProject = catchAsync(async (req, res, next) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ status: 'fail', message: 'Project name is required' });
  }

  const project = await Project.create({
    name,
    createdBy: req.user.id,
    members: [req.user.id],
    workspaceId: req.user.workspaceId,
  });

  res.status(201).json({
    status: 'success',
    data: { project },
  });
});

// Get all projects for logged-in user
exports.getProjects = catchAsync(async (req, res, next) => {
  // Return projects where user is creator OR a member AND in same workspace
  const projects = await Project.find({
    workspaceId: req.user.workspaceId,
    members: req.user.id,
  }).populate('createdBy', 'name email');

  res.status(200).json({
    status: 'success',
    results: projects.length,
    data: { projects },
  });
});

// Get project by ID (ensure member)
exports.getProject = catchAsync(async (req, res, next) => {
  const project = await Project.findOne({
    _id: req.params.id,
    workspaceId: req.user.workspaceId,
    members: req.user.id,
  }).populate('members', 'name email');

  if (!project) {
    return res.status(404).json({ status: 'fail', message: 'Project not found or you are not a member' });
  }

  res.status(200).json({
    status: 'success',
    data: { project },
  });
});

// Get project analytics
exports.getProjectAnalytics = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  // Ensure member access and workspace isolation
  const project = await Project.findOne({
    _id: id,
    workspaceId: req.user.workspaceId,
    members: req.user.id,
  });

  if (!project) {
    return res.status(404).json({ status: 'fail', message: 'Project not found or access denied' });
  }

  const tasks = await Task.find({ project: id });
  const completedTasks = tasks.filter(t => t.status === 'done');
  
  let delayedTasksCount = 0;
  let atRiskTasksCount = 0;

  const tasksWithDelayStatus = tasks.map(t => {
    const delayStatus = calculateDelayStatus(t);
    if (delayStatus === 'Delayed') delayedTasksCount++;
    if (delayStatus === 'At Risk') atRiskTasksCount++;

    return { ...t.toObject(), delayStatus };
  });

  const totalDuration = completedTasks.reduce((acc, t) => acc + (t.actualDuration || 0), 0);
  const avgCompletionTime = completedTasks.length > 0 ? Math.round(totalDuration / completedTasks.length) : 0;

  const analytics = {
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    delayedTasks: delayedTasksCount,
    atRiskTasks: atRiskTasksCount,
    avgCompletionTime, // in minutes
    completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
  };

  res.status(200).json({
    status: 'success',
    data: { 
      analytics,
      tasks: tasksWithDelayStatus
    },
  });
});
