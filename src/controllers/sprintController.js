const Sprint = require('../models/Sprint');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Handles the creation, scheduling, and deletion of synchronized operational sprints.
exports.createSprint = catchAsync(async (req, res, next) => {
  const { name, startDate, endDate, status, project, goal } = req.body;

  if (!name || !startDate || !endDate) {
    return next(
      new AppError('Please provide sprint name, start date, end date', 400)
    );
  }

  const sprint = await Sprint.create({
    name,
    goal,
    startDate,
    endDate,
    status: status || 'upcoming',
    project,
    createdBy: req.user._id,
    workspaceId: req.user.workspaceId,
  });

  res.status(201).json({
    status: 'success',
    data: {
      sprint,
    },
  });
});

exports.getAllSprints = catchAsync(async (req, res, next) => {
  const { project } = req.query;
  const { getProjectAccessQuery } = require('../utils/queryHelpers');
  const Project = require('../models/Project');

  // Baseline workspace isolation
  let filter = { workspaceId: req.user.workspaceId };

  if (project) {
    filter.project = project;
  } else {
    // If not a workspace-level authorized user, restrict to accessible projects
    const isGlobalViewer = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'TECH_LEAD'].includes(req.user.role);
    
    if (!isGlobalViewer) {
      const accessibleProjects = await Project.find(getProjectAccessQuery(req.user)).select('_id');
      const projectIds = accessibleProjects.map(p => p._id);
      // Show sprints linked to accessible projects OR sprints with no specifically assigned project but in the workspace
      filter.$or = [
        { project: { $in: projectIds } },
        { project: { $in: [null, undefined] } },
        { createdBy: req.user._id }
      ];
    }
  }

  const sprints = await Sprint.find(filter)
    .populate('project', 'name')
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: sprints.length,
    data: {
      sprints,
    },
  });
});

exports.getSprint = catchAsync(async (req, res, next) => {
  const sprint = await Sprint.findById(req.params.id).populate('project');

  if (!sprint) {
    return next(
      new AppError('No sprint found with that ID', 404)
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      sprint,
    },
  });
});

exports.updateSprint = catchAsync(async (req, res, next) => {
  const sprint = await Sprint.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!sprint) {
    return next(
      new AppError('No sprint found with that ID', 404)
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      sprint,
    },
  });
});

exports.deleteSprint = catchAsync(async (req, res, next) => {
  const sprint = await Sprint.findByIdAndDelete(req.params.id);

  if (!sprint) {
    return next(
      new AppError('No sprint found with that ID', 404)
    );
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// AI & Real-time Metrics
exports.syncSprintHealth = catchAsync(async (req, res, next) => {
  const Task = require('../models/Task');
  const sprint = await Sprint.findById(req.params.id);

  if (!sprint) return next(new AppError('Sprint not found', 404));

  const tasks = await Task.find({ sprint: sprint._id });
  
  if (tasks.length === 0) {
    sprint.healthScore = 100;
  } else {
    const doneTasks = tasks.filter(t => t.status === 'done');
    const blockedTasks = tasks.filter(t => t.status === 'in_progress' && t.isBlocked); // Assuming isBlocked field or logic
    
    // Logic for Health: (Completion % * 0.7) + (Time Alignment * 0.3)
    const completionRate = doneTasks.length / tasks.length;
    const now = new Date();
    const totalTime = sprint.endDate - sprint.startDate;
    const elapsed = now - sprint.startDate;
    const timeProgress = Math.min(Math.max(elapsed / totalTime, 0), 1);
    
    const drift = completionRate - timeProgress;
    sprint.healthScore = Math.max(0, Math.min(100, Math.round((1 + drift) * 50 + 50)));
    
    // Pressure Index: Ratio of tasks in progress vs done
    sprint.pressureIndex = Math.min(1, tasks.filter(t => t.status !== 'done').length / (tasks.length || 1));
  }

  // Save snapshot
  sprint.metricsSnapshot.push({
    burnRate: (tasks.filter(t => t.status === 'done').length / tasks.length) || 0,
    completionPercentage: (tasks.filter(t => t.status === 'done').length / tasks.length) * 100,
    pressure: sprint.pressureIndex
  });

  await sprint.save();

  res.status(200).json({
    status: 'success',
    data: {
      healthScore: sprint.healthScore,
      pressureIndex: sprint.pressureIndex
    }
  });
});
