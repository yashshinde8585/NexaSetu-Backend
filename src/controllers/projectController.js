const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const auditService = require('../services/auditService');
const { calculateDelayStatus } = require('../utils/taskUtils');
const catchAsync = require('../utils/catchAsync');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const {
  isManagerOrAdmin,
  hasLeadRestriction,
} = require('../utils/authHelpers');

// Manages creation, modification, and telemetry analysis for system portfolios and projects.

// Initializes a new project entity within the user's workspace.
exports.createProject = catchAsync(async (req, res, next) => {
  const { name, sprint } = req.body;

  // RBAC: Only Admins and Managers can create projects
  if (!isManagerOrAdmin(req.user) || hasLeadRestriction(req.user)) {
    return res
      .status(403)
      .json({
        status: 'fail',
        message: 'You do not have permission to create projects.',
      });
  }

  if (!name) {
    return res
      .status(400)
      .json({ status: 'fail', message: 'Project name is required' });
  }

  if (!req.user.workspaceId) {
    return res.status(400).json({
      status: 'fail',
      message: 'Tactical Workspace context is missing. Please re-authenticate.',
    });
  }

  const project = await Project.create({
    name,
    sprint: sprint && sprint.trim() ? sprint : undefined,
    createdBy: req.user._id,
    members: [req.user._id],
    workspaceId: req.user.workspaceId,
  });

  await auditService.log({
    action: 'CREATE_PROJECT',
    req,
    entityType: 'PROJECT',
    entityId: project._id,
    details: { name: project.name },
  });

  res.status(201).json({
    status: 'success',
    data: { project },
  });
});

// Retrieves all projects the current user is authorized to manage or view.
exports.getProjects = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitValue = parseInt(limit);

  const query = getProjectAccessQuery(req.user);

  const projects = await Project.find(query)
    .populate('createdBy', 'name email role')
    .populate('members', 'name email role')
    .skip(skip)
    .limit(limitValue)
    .sort('-createdAt')
    .lean();

  const total = await Project.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: projects.length,
    pagination: {
      total,
      page: parseInt(page),
      limit: limitValue,
      pages: Math.ceil(total / limitValue)
    },
    data: { projects },
  });
});

// Fetches specific project telemetry ensuring strict workspace containment.
exports.getProject = catchAsync(async (req, res, next) => {
  const query = getProjectAccessQuery(req.user);
  query._id = req.params.id;

  const project = await Project.findOne(query).populate(
    'members',
    'name email role'
  );

  if (!project) {
    const exists = await Project.findById(req.params.id);
    if (!exists) {
      return res
        .status(404)
        .json({
          status: 'fail',
          message: 'Mission footprint not found in the central ledger.',
        });
    }
    return res.status(403).json({
      status: 'fail',
      message: 'You lack the tactical credentials to view this project.',
      diagnostic: {
        userWorkspace: req.user.workspaceId,
        projectWorkspace: exists.workspaceId,
        match:
          req.user.workspaceId.toString() === exists.workspaceId.toString(),
      },
    });
  }

  res.status(200).json({
    status: 'success',
    data: { project },
  });
});

// Aggregates task matrices to generate robust health and completion metrics.
exports.getProjectAnalytics = catchAsync(async (req, res, next) => {
  const { sprintId } = req.query;
  const { id } = req.params;

  const query = getProjectAccessQuery(req.user);
  query._id = id;

  const project = await Project.findOne(query);

  if (!project) {
    const exists = await Project.findById(id);
    if (!exists) {
      return res
        .status(404)
        .json({
          status: 'fail',
          message: 'Mission footprint not found in the central ledger.',
        });
    }
    return res
      .status(403)
      .json({
        status: 'fail',
        message: 'You lack the tactical credentials to access these analytics.',
      });
  }

  const pipeline = [
    { $match: { project: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: 'projects',
        localField: 'project',
        foreignField: '_id',
        as: 'projectData',
      },
    },
    { $unwind: '$projectData' },
  ];

  if (sprintId) {
    const sprintObjectId = new mongoose.Types.ObjectId(sprintId);
    pipeline.push({
      $match: {
        $or: [
          { sprint: sprintObjectId },
          {
            $and: [
              { sprint: { $exists: false } },
              { 'projectData.sprint': sprintObjectId },
            ],
          },
          {
            $and: [{ sprint: null }, { 'projectData.sprint': sprintObjectId }],
          },
        ],
      },
    });
  }

  const tasksAggregation = await Task.aggregate(pipeline);

  const tasks = tasksAggregation;
  const completedTasks = tasks.filter((t) => t.status === 'done');

  let delayedTasksCount = 0;
  let atRiskTasksCount = 0;

  const tasksWithDelayStatus = tasks.map((t) => {
    const delayStatus = calculateDelayStatus(t);
    if (delayStatus === 'Delayed') delayedTasksCount++;
    if (delayStatus === 'At Risk') atRiskTasksCount++;

    return { ...t, delayStatus };
  });

  const totalDuration = completedTasks.reduce(
    (acc, t) => acc + (t.actualDuration || 0),
    0
  );
  const avgCompletionTime =
    completedTasks.length > 0
      ? Math.round(totalDuration / completedTasks.length)
      : 0;

  const analytics = {
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    delayedTasks: delayedTasksCount,
    atRiskTasks: atRiskTasksCount,
    avgCompletionTime,
    completionRate:
      tasks.length > 0
        ? Math.round((completedTasks.length / tasks.length) * 100)
        : 0,
  };

  res.status(200).json({
    status: 'success',
    data: {
      analytics,
      tasks: tasksWithDelayStatus,
    },
  });
});

// Modifies top-level project metadata with strict role-based access validation.
exports.updateProject = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // 1. Fetch current project to check membership (isolated by workspace)
  const project = await Project.findOne({
    _id: id,
    workspaceId: req.user.workspaceId,
  });
  if (!project) {
    return res
      .status(404)
      .json({
        status: 'fail',
        message: 'No project found with that ID in your workspace',
      });
  }

  const isMember = project.members.some(
    (m) => m.toString() === req.user.id.toString()
  );
  const isManager = isManagerOrAdmin(req.user) && !hasLeadRestriction(req.user);

  // 2. Field-level RBAC:
  // Non-managers can ONLY update the 'sprint' field (mission synchronization)
  const isOnlySprintUpdate =
    Object.keys(updateData).length === 1 && 'sprint' in updateData;

  if (!isManager && (!isMember || !isOnlySprintUpdate)) {
    return res.status(403).json({
      status: 'fail',
      message:
        'You do not have permission to update tactical settings for this mission.',
    });
  }

  const updatedProject = await Project.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate('members', 'name email role');

  res.status(200).json({
    status: 'success',
    data: { project: updatedProject },
  });
});
