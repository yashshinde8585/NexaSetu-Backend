const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const TaskStatusHistory = require('../models/TaskStatusHistory');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { calculateDelayStatus } = require('../utils/taskUtils');
const { isManagerOrAdmin } = require('../utils/authHelpers');
const {
  getTaskAccessQuery,
  getProjectAccessQuery,
} = require('../utils/queryHelpers');
const { formatDueDate } = require('../utils/dashboardHelpers');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const commentController = require('./commentController');

// Manage task lifecycle, creation, and retrieval.

const updateTaskTimeTracking = (task, newStatus) => {
  const now = new Date();
  
  // A task is actively consuming time only if in_progress AND NOT blocked
  const isCurrentlyActive = (task.status === 'in_progress' && !task.blocked);
  const willBeActive = (newStatus === 'in_progress');

  // If moving FROM an active state to an inactive one, subtract elapsed time
  if (isCurrentlyActive && !willBeActive && task.lastStartedAt) {
    const elapsedMinutes = Math.max(0, (now - task.lastStartedAt) / (1000 * 60));
    task.remainingDuration = Math.max(0, (task.remainingDuration || task.estimatedDuration) - elapsedMinutes);
    task.lastStartedAt = null;
  }
  
  // If moving TO an active state, mark start time
  if (willBeActive && !isCurrentlyActive) {
    task.lastStartedAt = now;
    if (task.remainingDuration === undefined || task.remainingDuration === null) {
      task.remainingDuration = task.estimatedDuration;
    }
  }

  // Record completion timestamps
  if (newStatus === 'done') {
    task.remainingDuration = 0;
    task.completedAt = now;
    
    const start = task.startedAt || task.createdAt;
    task.actualDuration = Math.round((now - start) / (1000 * 60));
  }
};

// Update task status and log activity.
exports.updateTaskStatus = catchAsync(async (req, res, next) => {
  const { taskId, status } = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return next(new AppError('No mission found with that ID', 404));
  }

  const oldStatus = task.status;
  updateTaskTimeTracking(task, status);
  task.status = status;
  task.timelineHistory.push({
    status,
    timestamp: Date.now(),
    reason: `System: Status transitioned from ${oldStatus} to ${status} by ${req.user.name}`,
  });

  await task.save();

  // Log to discussion feed
  await commentController.logActivity(
    taskId,
    req.user._id,
    `Status transitioned from ${oldStatus} to ${status}`
  );

  res.status(200).json({
    status: 'success',
    data: { task },
  });
});

// Create a new task.
exports.createTask = catchAsync(async (req, res, next) => {
  const {
    title,
    description,
    project,
    assignedUser,
    status,
    source,
    isAiGenerated,
    dueDate,
    sprint,
    priority,
    estimatedDuration,
  } = req.body;

  const query = getProjectAccessQuery(req.user);
  query._id = project;
  const projectDoc = await Project.findOne(query);
  if (!projectDoc) {
    return res
      .status(404)
      .json({
        status: 'fail',
        message: 'Project not found or you are not a member',
      });
  }

  const taskData = {
    title,
    description,
    project,
    sprint,
    assignedUser: assignedUser || null,
    status: status || 'todo',
    source: source || 'manual',
    isAiGenerated: isAiGenerated || false,
    dueDate: dueDate || null,
    priority: priority || 'medium',
    estimatedDuration: estimatedDuration || 30,
    remainingDuration: estimatedDuration || 30,
    createdBy: req.user._id,
    workspaceId: projectDoc.workspaceId,
  };

  // Initial lifecycle timestamps + Start Countdown if created already in progress
  if (taskData.status === 'in_progress') {
    taskData.startedAt = new Date();
    taskData.lastStartedAt = new Date();
  } else if (taskData.status === 'done') {
    taskData.startedAt = taskData.startedAt || new Date();
    taskData.completedAt = new Date();
    taskData.actualDuration = 0;
  }

  const task = await Task.create(taskData);

  // Log initial status history
  await TaskStatusHistory.create({
    task: task._id,
    fromStatus: 'none',
    toStatus: task.status,
    changedBy: req.user?._id,
  });

  // Emit event to orchestrator
  await AgentOrchestrator.handleEvent({
    type: 'TASK_CREATED',
    entityId: task._id,
    entityType: 'task',
    project: task.project,
    payload: task,
  });

  // Create notification for assignee
  if (task.assignedUser && task.assignedUser.toString() !== req.user._id.toString()) {
    const ticketId = `${projectDoc.key || 'NEXA'}-${task.taskNumber || 'NEW'}`;
    await Notification.create({
      recipient: task.assignedUser,
      sender: req.user._id,
      type: 'TASK_ASSIGNED',
      title: req.user.name,
      message: `[${ticketId}] ${task.title}`,
      link: `/task/${task._id}`,
      workspaceId: req.user.workspaceId
    });
  }

  res.status(201).json({
    status: 'success',
    data: { task },
  });
});

// Retrieve tasks for a project.
exports.getTasks = catchAsync(async (req, res, next) => {
  const { projectId } = req.params;
  const { sprintId, page = 1, limit = 50 } = req.query;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitValue = parseInt(limit);

  const projectQuery = getProjectAccessQuery(req.user);
  projectQuery._id = projectId;
  const project = await Project.findOne(projectQuery);
  if (!project) {
    return res
      .status(404)
      .json({ status: 'fail', message: 'Project not found or access denied' });
  }

  const pipeline = [
    { $match: { project: new mongoose.Types.ObjectId(projectId) } },
  ];

  if (sprintId) {
    const sprintObjectId = new mongoose.Types.ObjectId(sprintId);
    const projectSprintId = project.sprint
      ? (project.sprint._id || project.sprint).toString()
      : null;

    const sprintMatch = { $or: [{ sprint: sprintObjectId }] };

    // If viewing the project's current sprint, also include unassigned tasks
    if (projectSprintId === sprintId) {
      sprintMatch.$or.push({ sprint: { $exists: false } }, { sprint: null });
    }

    pipeline.push({ $match: sprintMatch });
  }

  // Add User and Sprint Lookup
  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'assignedUser',
        foreignField: '_id',
        as: 'assignedUserData',
      },
    },
    {
      $lookup: {
        from: 'sprints',
        localField: 'sprint',
        foreignField: '_id',
        as: 'sprintData',
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $addFields: {
        assignedUser: { $arrayElemAt: ['$assignedUserData', 0] },
        projectKey: project.key || 'NEXA',
        sprintInfo: { $arrayElemAt: ['$sprintData', 0] },
      },
    },
    {
      $project: {
        assignedUserData: 0,
        sprintData: 0,
      },
    },
    // Strategic Pagination: Preventing payload explosion on high-density projects
    { $skip: skip },
    { $limit: limitValue }
  );

  const tasks = await Task.aggregate(pipeline);

  const enrichedTasks = tasks.map((t) => {
    const delayStatus = calculateDelayStatus(t);
    return { 
      ...t, 
      delayStatus,
      createdFormatted: formatDueDate(t.createdAt)
    };

  });

  const totalTasks = await Task.countDocuments({ project: projectId, ...(sprintId ? { sprint: sprintId } : {}) });

  res.status(200).json({
    status: 'success',
    results: enrichedTasks.length,
    pagination: {
      total: totalTasks,
      page: parseInt(page),
      limit: limitValue,
      pages: Math.ceil(totalTasks / limitValue)
    },
    data: { tasks: enrichedTasks },
  });
});

// Retrieve a task by ID.
exports.getTaskById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Find task and populate core references
  const task = await Task.findById(id)
    .populate('project', 'name key createdBy')
    .populate('assignedUser', 'name email')
    .populate('createdBy', 'name email')
    .populate('sprint', 'name startDate endDate status');

  if (!task) {
    return res.status(404).json({ status: 'fail', message: 'Task not found' });
  }

  // Verify access via project membership (if applicable)
  // The protect middleware already ensures req.user exists
  const query = getProjectAccessQuery(req.user);
  query._id = task.project._id;
  const projectAccess = await Project.findOne(query);

  if (!projectAccess) {
    return res
      .status(403)
      .json({ status: 'fail', message: 'Access denied to this project task' });
  }

  const taskObj = task.toObject();
  taskObj.delayStatus = calculateDelayStatus(taskObj);
  taskObj.projectKey = task.project.key || 'NEXA';
  taskObj.sprintInfo = taskObj.sprint; // Mapping names for frontend consistency
  taskObj.createdFormatted = formatDueDate(taskObj.createdAt);

  res.status(200).json({
    status: 'success',
    data: { task: taskObj },
  });
});

// Update task details and manage lifecycle.
exports.updateTask = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { title, description, status, assignedUser, dueDate, priority, estimatedDuration } = req.body;

  const task = await Task.findById(id);
  if (!task) {
    return res.status(404).json({ status: 'fail', message: 'Task not found' });
  }

  const query = getProjectAccessQuery(req.user);
  query._id = task.project;
  const project = await Project.findOne(query);
  if (!project) {
    return res.status(403).json({ status: 'fail', message: 'Access denied' });
  }

  // Explicitly pick allowed fields to prevent injection of sensitive fields like workspaceId or taskNumber
  const allowedFields = ['title', 'description', 'assignedUser', 'dueDate', 'priority', 'estimatedDuration'];
  const updateData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) updateData[field] = req.body[field];
  });

  if (status && status !== task.status) {
    updateTaskTimeTracking(task, status);
    updateData.status = status;
    updateData.remainingDuration = task.remainingDuration;
    updateData.lastStartedAt = task.lastStartedAt;

    if (status === 'in_progress' && !task.startedAt) {
      updateData.startedAt = new Date();
    }

    if (status === 'done') {
      updateData.completedAt = new Date();
      const start = task.startedAt || task.createdAt;
      updateData.actualDuration = Math.round(
        (new Date() - start) / (1000 * 60)
      ); // Record in minutes
    }

    if (status !== 'done' && task.status === 'done') {
      updateData.completedAt = null;
      updateData.actualDuration = null;
    }
  }

  const updatedTask = await Task.findByIdAndUpdate(id, updateData, {
    returnDocument: 'after',
    runValidators: true,
  }).populate('assignedUser', 'name email');

  // Notify on assignment change
  if (assignedUser && assignedUser.toString() !== task.assignedUser?.toString()) {
    const ticketId = `${project.key || 'NEXA'}-${updatedTask.taskNumber || 'MEMO'}`;
    await Notification.create({
      recipient: assignedUser,
      sender: req.user._id,
      type: 'TASK_ASSIGNED',
      title: req.user.name,
      message: `[${ticketId}] ${updatedTask.title}`,
      link: `/task/${updatedTask._id}`,
      workspaceId: req.user.workspaceId
    });
  }

  // Log status change history
  if (status && status !== task.status) {
    await TaskStatusHistory.create({
      task: updatedTask._id,
      fromStatus: task.status,
      toStatus: status,
      changedBy: req.user?._id,
    });
  }

  // Emit update event to orchestrator
  await AgentOrchestrator.handleEvent({
    type: 'TASK_UPDATED',
    entityId: updatedTask._id,
    entityType: 'task',
    project: updatedTask.project,
    payload: updatedTask,
  });

  res.status(200).json({
    status: 'success',
    data: { task: updatedTask },
  });
});

// Retrieve tasks assigned to the current user.
exports.getMyTasks = catchAsync(async (req, res, next) => {
  const { scope, page = 1, limit = 20 } = req.query; // 'personal' or 'workspace'
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitValue = parseInt(limit);
  const isLeadOrAdmin =
    req.user.role === 'TECH_LEAD' ||
    req.user.role === 'WORKSPACE_ADMIN' ||
    req.user.role === 'WORKSPACE_MANAGER';

  const projectAccessQuery = getProjectAccessQuery(req.user);
  const accessibleProjects =
    await Project.find(projectAccessQuery).select('_id');
  const accessibleProjectIds = accessibleProjects.map((p) => p._id);

  let query = { assignedUser: req.user._id };

  if (scope === 'workspace') {
    // Show all tasks in all projects the user is part of
    query = { project: { $in: accessibleProjectIds } };
  } else if (isLeadOrAdmin) {
    // Standard lead view: personal + review + delayed
    query = {
      $or: [
        { assignedUser: req.user._id },
        {
          project: { $in: accessibleProjectIds },
          $or: [
            { status: 'in_review' },
            { status: { $ne: 'done' }, dueDate: { $lt: new Date() } },
          ],
        },
      ],
    };
  }

  const tasks = await Task.find(query)
    .sort('-completedAt -updatedAt')
    .skip(skip)
    .limit(limitValue)
    .populate('project', 'name')
    .populate('assignedUser', 'name email')
    .lean();

  const enrichedTasks = tasks.map((t) => {
    const delayStatus = calculateDelayStatus(t);
    return { 
      ...t, 
      delayStatus,
      createdFormatted: formatDueDate(t.createdAt)
    };

  });

  const totalTasks = await Task.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: enrichedTasks.length,
    pagination: {
      total: totalTasks,
      page: parseInt(page),
      limit: limitValue,
      pages: Math.ceil(totalTasks / limitValue)
    },
    data: { tasks: enrichedTasks },
  });
});
// Toggle task blockage status and log activity.
exports.toggleTaskBlockage = catchAsync(async (req, res, next) => {
  const { taskId, blocked, reason } = req.body;

  const task = await Task.findById(taskId);
  if (!task) {
    return next(new AppError('No mission found with that ID', 404));
  }

  const oldBlocked = task.blocked;
  task.blocked = blocked;
  
  if (blocked) {
    task.blockedAt = new Date();
    task.blockedReason = reason || 'Waiting on external dependency';
  } else {
    task.blockedAt = null;
    task.blockedReason = null;
  }

  await task.save();

  // Log to discussion feed
  const actionText = blocked ? `MISSION BLOCKED: ${reason}` : 'MISSION UNBLOCKED';
  await commentController.logActivity(
    taskId,
    req.user._id,
    actionText
  );

  res.status(200).json({
    status: 'success',
    data: { task },
  });
});
