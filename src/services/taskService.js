const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const TaskStatusHistory = require('../models/TaskStatusHistory');
const Directive = require('../models/Directive');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { getIO, EVENTS } = require('../socket');
const { calculateDelayStatus } = require('../utils/taskUtils');
const { isManagerOrAdmin } = require('../utils/authHelpers');
const { getTaskAccessQuery, getProjectAccessQuery } = require('../utils/queryHelpers');
const { formatDueDate } = require('../utils/dashboardHelpers');
const AppError = require('../utils/appError');
const commentService = require('../services/commentService');
const { sanitizeHTML } = require('../utils/sanitizer');
const { invalidateCache } = require('../middleware/cacheMiddleware');
const { getStorageQueue } = require('../queues/storageQueue');
const storageService = require('../services/storageService');
const logger = require('../utils/logger');

const { updateTaskTimeTracking } = require('./taskHelpers/TaskTimeTracker');
const { validateTaskStorage } = require('./taskHelpers/TaskStorageHandler');
const { trackTaskTransition, trackTaskCreation } = require('./taskHelpers/TaskMetricsHandler');
const { logTaskUpdate, logTaskCreation } = require('./taskHelpers/TaskAuditLogger');


const updateTaskStatus = async (user, taskId, status, req) => {
  try {
    if (!status) {
      throw new AppError('Mission Status is required.', 400);
    }

    const task = await Task.findById(taskId);
    if (!task) {
      throw new AppError('No mission found with that ID', 404);
    }

    const oldStatus = task.status;
    
    // If status hasn't changed, return early to save resources
    if (oldStatus === status) return task;

    const isManager = isManagerOrAdmin(user);
    
    // --- DIRECTIVE ENFORCEMENT LAYER ---
    const activeStabilize = await Directive.findOne({
      workspaceId: user.workspaceId,
      status: 'issued',
      type: 'STABILIZE',
      $or: [
        { 'scope.type': 'WORKSPACE' },
        { 'scope.type': 'PROJECT', 'scope.targetId': task.project }
      ]
    });

    if (activeStabilize && !['in_review', 'done', 'blocked'].includes(status) && !isManager) {
      throw new AppError(`Action Blocked: Project is under a STABILIZE directive. Focus on completing or reviewing current missions only.`, 403);
    }

    // --- OWNERSHIP & STATE TRANSITION LAYER ---
    
    // 1. Mandatory Review Check
    if (status === 'done' && oldStatus !== 'approved' && task.reviewers?.length > 0 && !isManager) {
      throw new AppError('Action Denied: Mission requires lead approval.', 403);
    }

    // 2. Ownership Shift: IN_REVIEW -> TL Owns
    if (status === 'in_review') {
      task.reviewStatus = 'pending';
      if (task.reviewers?.length > 0) {
        task.assignedUser = task.reviewers[0]; // Shift ownership to lead reviewer
      }
    }

    // 4. Blocked Handling: Assign Escalation
    if (status === 'blocked') {
      if (!task.blockedReason) throw new AppError('Blockage reason required.', 400);
      const projectDoc = await Project.findById(task.project);
      if (projectDoc) {
        task.escalationOwner = projectDoc.createdBy; // Escalate to Project Owner
        task.isEscalated = true;
      }
    } else {
      task.isEscalated = false;
      task.escalationOwner = null;
    }

    const terminalStates = ['done', 'archived'];
    if (terminalStates.includes(oldStatus) && !['todo', 'in_progress', 'blocked'].includes(status) && !isManager) {
      throw new AppError(`Action Denied: Cannot move a mission from ${oldStatus} to ${status} without manager approval.`, 403);
    }

    updateTaskTimeTracking(task, status);
    task.status = status;
    
    // Use timelineHistory ONLY for schema-compliant events (due dates)
    // For status, use the TaskStatusHistory model
    await TaskStatusHistory.create({
      task: taskId,
      fromStatus: oldStatus,
      toStatus: status,
      changedBy: user._id,
      timestamp: new Date()
    });

    await task.save();

    await logTaskUpdate(user, task._id, { status: oldStatus }, { status: status }, req);

    await commentService.logActivity(
      taskId,
      user._id,
      `Status transitioned from ${oldStatus} to ${status}`
    );

    logger.info(`[STATE_TRANSITION] task.status: ${oldStatus} -> ${status} for task ${taskId}`);
    trackTaskTransition(user, taskId, oldStatus, status);

    await invalidateCache(user.workspaceId, '*task*');

    try {
      getIO().to(task.project.toString()).emit(EVENTS.TASK_UPDATED, { 
        type: 'UPDATE', 
        taskId: task._id, 
        status: task.status,
        updatedBy: user._id 
      });
    } catch (err) {
      logger.warn('[SOCKET] Failed to broadcast state transition');
    }

    return task;
  } catch (error) {
    throw error;
  }
};

const createTask = async (user, data) => {
  try {
    const {
      title, description, project, assignedUser, status, source,
      isAiGenerated, dueDate, startDate, durationUnit, sprint, priority, type, estimatedDuration, attachments
    } = data;

    const query = getProjectAccessQuery(user);
    query._id = project;
    const projectDoc = await Project.findOne(query);
    if (!projectDoc) {
      throw new AppError('Project not found or you are not a member', 404);
    }

    // --- DIRECTIVE ENFORCEMENT ---
    const activeStabilize = await Directive.findOne({
      workspaceId: user.workspaceId,
      status: 'issued',
      type: 'STABILIZE',
      $or: [
        { 'scope.type': 'WORKSPACE' },
        { 'scope.type': 'PROJECT', 'scope.targetId': project }
      ]
    });

    if (activeStabilize && !isManagerOrAdmin(user)) {
      throw new AppError(`New Mission Denied: Project is under a STABILIZE directive. No new tasks allowed until stabilization is complete.`, 403);
    }

    const totalNewSize = await validateTaskStorage(
      projectDoc.workspaceId, 
      project, 
      'new', 
      attachments
    );

    const taskData = {
      title: sanitizeHTML(title),
      description: sanitizeHTML(description),
      project,
      sprint,
      assignedUser: assignedUser || null,
      status: status || 'todo',
      source: source || 'manual',
      isAiGenerated: isAiGenerated || false,
      dueDate: dueDate || null,
      startDate: startDate || null,
      durationUnit: durationUnit || 'minutes',
      priority: priority || 'medium',
      type: type || 'task',
      estimatedDuration: estimatedDuration || 30,
      remainingDuration: estimatedDuration || 30,
      createdBy: user._id,
      workspaceId: projectDoc.workspaceId,
      attachments: attachments || [],
    };

    if (taskData.status === 'in_progress') {
      taskData.startedAt = new Date();
      taskData.lastStartedAt = new Date();
    } else if (taskData.status === 'done') {
      taskData.startedAt = taskData.startedAt || new Date();
      taskData.completedAt = new Date();
      taskData.actualDuration = 0;
    }

    const task = await Task.create(taskData);

    await logTaskCreation(user, task._id, taskData);

    await storageService.updateStorageUsage(task.workspaceId, totalNewSize);

    await TaskStatusHistory.create({
      task: task._id,
      fromStatus: 'none',
      toStatus: task.status,
      changedBy: user?._id,
    });

    await AgentOrchestrator.handleEvent({
      type: 'TASK_CREATED',
      entityId: task._id,
      entityType: 'task',
      project: task.project,
      workspaceId: task.workspaceId,
      payload: task,
    });

    if (task.assignedUser && task.assignedUser.toString() !== user._id.toString()) {
      const ticketId = `${projectDoc.key || 'NEXA'}-${task.taskNumber || 'NEW'}`;
      const notification = await Notification.create({
        recipient: task.assignedUser,
        sender: user._id,
        type: 'TASK_ASSIGNED',
        title: user.name,
        message: `[${ticketId}] ${task.title}`,
        link: `/task/${task._id}`,
        workspaceId: task.workspaceId
      });

      try {
        getIO().to(task.assignedUser.toString()).emit(EVENTS.NOTIFICATION_RECEIVED, notification);
      } catch (err) {}
    }

    trackTaskCreation(user, task._id, task.project);

    await invalidateCache(user.workspaceId, '*task*');

    try {
      getIO().to(task.project.toString()).emit(EVENTS.TASK_UPDATED, { 
        type: 'CREATE', 
        task: task,
        projectId: task.project
      });
    } catch (err) {
      logger.warn('[SOCKET] Failed to broadcast task creation');
    }

    return task;
  } catch (error) {
    logger.error('[TASK-SERVICE] Create Task Error: %o', error);
    throw error;
  }
};

const getTasks = async (user, projectId, sprintId, page = 1, limit = 50) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitValue = parseInt(limit);

  const projectQuery = getProjectAccessQuery(user);
  projectQuery._id = projectId;
  const project = await Project.findOne(projectQuery);
  if (!project) {
    throw new AppError('Project not found or access denied', 404);
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

    if (projectSprintId === sprintId) {
      sprintMatch.$or.push({ sprint: { $exists: false } }, { sprint: null });
    }

    pipeline.push({ $match: sprintMatch });
  }

  pipeline.push({
    $facet: {
      metadata: [{ $count: 'totalTasks' }],
      data: [
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limitValue },
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
          $addFields: {
            assignedUser: { $arrayElemAt: ['$assignedUserData', 0] },
            projectKey: project.key || 'NEXA',
            sprintInfo: { $arrayElemAt: ['$sprintData', 0] },
          },
        },
        { $project: { assignedUserData: 0, sprintData: 0 } },
      ],
    },
  });

  const [result] = await Task.aggregate(pipeline);
  const tasks = result.data || [];
  const totalTasks = result.metadata[0]?.totalTasks || 0;

  const enrichedTasks = tasks.map((t) => {
    const delayStatus = calculateDelayStatus(t);
    return { 
      ...t, 
      delayStatus,
      createdFormatted: formatDueDate(t.createdAt)
    };
  });

  return { tasks: enrichedTasks, totalTasks, page: parseInt(page), limit: limitValue };
};

const getTaskById = async (user, id) => {
  const task = await Task.findById(id)
    .populate('project', 'name key createdBy')
    .populate('assignedUser', 'name email')
    .populate('createdBy', 'name email')
    .populate('sprint', 'name startDate endDate status');

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const query = getProjectAccessQuery(user);
  query._id = task.project._id;
  const projectAccess = await Project.findOne(query);

  if (!projectAccess) {
    throw new AppError('Access denied', 403);
  }

  const taskObj = task.toObject();
  taskObj.delayStatus = calculateDelayStatus(taskObj);
  taskObj.projectKey = task.project.key || 'NEXA';
  taskObj.sprintInfo = taskObj.sprint; 
  taskObj.createdFormatted = formatDueDate(taskObj.createdAt);

  if (taskObj.attachments && taskObj.attachments.length > 0) {
    const enrichmentPromises = taskObj.attachments.map(async (att) => {
      const signedUrl = await storageService.getSignedDownloadUrl(att.storagePath);
      return { ...att, url: signedUrl || att.url };
    });
    taskObj.attachments = await Promise.all(enrichmentPromises);
  }

  return taskObj;
};

const updateTask = async (user, id, data) => {
  const task = await Task.findById(id);
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const query = getProjectAccessQuery(user);
  query._id = task.project;
  const project = await Project.findOne(query);
  if (!project) {
    throw new AppError('Access denied', 403);
  }

  const allowedFields = ['title', 'description', 'status', 'assignedUser', 'dueDate', 'startDate', 'durationUnit', 'priority', 'type', 'estimatedDuration', 'attachments'];
  const updateData = {};
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updateData[field] = ['title', 'description'].includes(field) 
        ? sanitizeHTML(data[field]) 
        : data[field];
    }
  });

  if (updateData.attachments) {
    const totalNewSize = await validateTaskStorage(
      project.workspaceId, 
      task.project, 
      task._id, 
      updateData.attachments
    );
    
    await storageService.updateStorageUsage(project.workspaceId, totalNewSize);
  }

  const clientVersion = data.version !== undefined ? data.version : data.__v;
  if (clientVersion === undefined) {
    throw new AppError('Conflict Prevention: Version number is required for updates.', 400);
  }

  const status = updateData.status;
  if (status && status !== task.status) {
    updateTaskTimeTracking(task, status);
    updateData.remainingDuration = task.remainingDuration;
    updateData.lastStartedAt = task.lastStartedAt;

    if (status === 'in_progress' && !task.startedAt) {
      updateData.startedAt = new Date();
    }

    if (status === 'done') {
      // ENFORCEMENT: No task can be closed without approval if reviewers are assigned
      if (task.reviewers?.length > 0 && task.reviewStatus !== 'approved' && !isManagerOrAdmin(user)) {
         throw new AppError('Execution Violation: Mandatory Lead Approval required before closure.', 403);
      }
      
      updateData.completedAt = new Date();
      const start = task.startedAt || task.createdAt;
      updateData.actualDuration = Math.round((new Date() - start) / (1000 * 60));
    }
  }

  const updatedTask = await Task.findOneAndUpdate(
    { _id: id, __v: clientVersion },
    { $set: updateData, $inc: { __v: 1 } },
    {
      returnDocument: 'after',
      runValidators: true,
    }
  ).populate('assignedUser', 'name email');

  if (!updatedTask) {
    throw new AppError('Conflict Detected: This task has been modified by another session.', 409);
  }

  await logTaskUpdate(user, updatedTask._id, task.toObject(), updatedTask.toObject());

  if (updateData.assignedUser && updateData.assignedUser.toString() !== task.assignedUser?.toString()) {
    const ticketId = `${project.key || 'NEXA'}-${updatedTask.taskNumber || 'MEMO'}`;
    const notification = await Notification.create({
      recipient: updateData.assignedUser,
      sender: user._id,
      type: 'TASK_ASSIGNED',
      title: user.name,
      message: `[${ticketId}] ${updatedTask.title}`,
      link: `/task/${updatedTask._id}`,
      workspaceId: user.workspaceId
    });

    // Push real-time alert to the recipient
    try {
      getIO().to(updateData.assignedUser.toString()).emit(EVENTS.NOTIFICATION_RECEIVED, notification);
    } catch (err) {}
  }

  if (status && status !== task.status) {
    await TaskStatusHistory.create({
      task: updatedTask._id,
      fromStatus: task.status,
      toStatus: status,
      changedBy: user?._id,
    });

    logger.info(`[STATE_TRANSITION] task.status: ${task.status} -> ${status} for task ${updatedTask._id}`);
    trackTaskTransition(user, updatedTask._id, task.status, status);

    // --- EXECUTION TRIGGER LAYER ---
    if (status === 'blocked') {
      await AgentOrchestrator.handleEvent({
        type: 'TASK_BLOCKED',
        entityId: updatedTask._id,
        entityType: 'task',
        project: updatedTask.project,
        workspaceId: updatedTask.workspaceId,
        payload: updatedTask
      });
    }

    if (status === 'in_review') {
      await AgentOrchestrator.handleEvent({
        type: 'TASK_REVIEW_PENDING',
        entityId: updatedTask._id,
        entityType: 'task',
        project: updatedTask.project,
        workspaceId: updatedTask.workspaceId,
        payload: updatedTask
      });
    }
  }

  await AgentOrchestrator.handleEvent({
    type: 'TASK_UPDATED',
    entityId: updatedTask._id,
    entityType: 'task',
    project: updatedTask.project,
    workspaceId: updatedTask.workspaceId,
    payload: updatedTask,
  });

  // Centralized Cache Invalidation
  await invalidateCache(updatedTask.workspaceId, '*task*');

  // Real-time Propagation
  try {
    getIO().to(updatedTask.project.toString()).emit(EVENTS.TASK_UPDATED, { 
      type: 'UPDATE', 
      task: updatedTask,
      projectId: updatedTask.project
    });
  } catch (err) {
    logger.warn('[SOCKET] Failed to broadcast task update');
  }

  return updatedTask;
};

const getMyTasks = async (user, scope, page = 1, limit = 20) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitValue = parseInt(limit);
  const isLeadOrAdmin =
    user.role === 'TECH_LEAD' ||
    user.role === 'WORKSPACE_ADMIN' ||
    user.role === 'WORKSPACE_MANAGER';

  const projectAccessQuery = getProjectAccessQuery(user);
  const accessibleProjects = await Project.find(projectAccessQuery).select('_id');
  const accessibleProjectIds = accessibleProjects.map((p) => p._id);

  let query = { assignedUser: user._id };

  if (scope === 'workspace') {
    query = { project: { $in: accessibleProjectIds } };
  } else if (isLeadOrAdmin) {
    query = {
      $or: [
        { assignedUser: user._id },
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

  return { tasks: enrichedTasks, totalTasks, page: parseInt(page), limit: limitValue };
};

const toggleTaskBlockage = async (user, taskId, blocked, reason) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('No mission found with that ID', 404);
  }

  task.blocked = blocked;
  
  if (blocked) {
    task.blockedAt = new Date();
    task.blockedReason = sanitizeHTML(reason) || 'Waiting on external dependency';
  } else {
    task.blockedAt = null;
    task.blockedReason = null;
  }

  await task.save();

  await commentService.logActivity(
    taskId,
    user._id,
    blocked ? `MISSION BLOCKED: ${reason}` : 'MISSION UNBLOCKED'
  );

  // Centralized Cache Invalidation
  await invalidateCache(user.workspaceId, '*task*');

  // Real-time Propagation
  try {
    getIO().to(task.project.toString()).emit(EVENTS.TASK_UPDATED, { 
      type: 'UPDATE', 
      taskId: task._id, 
      blocked: task.blocked,
      projectId: task.project
    });
  } catch (err) {
    logger.warn('[SOCKET] Failed to broadcast blockage state');
  }

  return task;
};

const updateTaskSteps = async (user, taskId, steps) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('No mission found with that ID', 404);
  }

  task.steps = steps;
  await task.save();

  await invalidateCache(user.workspaceId, '*task*');

  try {
    getIO().to(task.project.toString()).emit(EVENTS.TASK_UPDATED, { 
      type: 'UPDATE', 
      taskId: task._id, 
      projectId: task.project
    });
  } catch (err) {
    logger.warn('[SOCKET] Failed to broadcast steps update');
  }

  return task;
};

const deleteTask = async (user, taskId) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('No mission found with that ID', 404);
  }

  const query = getProjectAccessQuery(user);
  query._id = task.project;
  const project = await Project.findOne(query);
  
  const isOwner = task.createdBy?.toString() === user._id.toString();
  if (!isManagerOrAdmin(user) && !isOwner) {
    throw new AppError('Action Denied.', 403);
  }

  if (task.attachments && task.attachments.length > 0) {
    const storagePaths = task.attachments.map(a => a.storagePath);
    const totalDeletedSize = task.attachments.reduce((acc, a) => acc + a.size, 0);
    
    const { getJobMetadata } = require('../utils/context');
    await getStorageQueue().add('cleanup-orphans', { 
      storagePaths,
      ...getJobMetadata()
    });
    await storageService.updateStorageUsage(task.workspaceId, -totalDeletedSize);
  }

  await Task.findByIdAndDelete(taskId);

  await commentService.logActivity(
    taskId,
    user._id,
    'MISSION TERMINATED (Deleted)'
  );

  // Centralized Cache Invalidation
  await invalidateCache(user.workspaceId, '*task*');

  // Real-time Propagation
  try {
    getIO().to(task.project.toString()).emit(EVENTS.TASK_UPDATED, { 
      type: 'DELETE', 
      taskId: taskId,
      projectId: task.project
    });
  } catch (err) {
    logger.warn('[SOCKET] Failed to broadcast task deletion');
  }

  return true;
};

const submitTaskReview = async (user, taskId, result, notes) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  // Permission check: User must be a reviewer or a Lead/Admin
  const isReviewer = task.reviewers.some(r => r.toString() === user._id.toString());
  const isManager = isManagerOrAdmin(user);

  if (!isReviewer && !isManager) {
    throw new AppError('Action Denied: You are not authorized to review this task.', 403);
  }

  const oldStatus = task.status;
  task.reviewStatus = result; // 'approved' or 'rejected'
  task.reviewNotes = sanitizeHTML(notes);

  if (result === 'approved') {
    task.status = 'done';
    task.completedAt = new Date();
  } else {
    task.status = 'in_progress'; // Rework loop
  }

  task.timelineHistory.push({
    reason: `Review Result: ${result.toUpperCase()} by ${user.name}. Notes: ${notes}`,
    timestamp: new Date()
  });

  await task.save();

  await commentService.logActivity(
    taskId,
    user._id,
    `REVIEW ${result.toUpperCase()}: ${notes}`
  );

  // Notify the assigned user
  if (task.assignedUser) {
    const notification = await Notification.create({
      recipient: task.assignedUser,
      sender: user._id,
      type: result === 'approved' ? 'TASK_COMPLETED' : 'TASK_REJECTED',
      title: `Task ${result === 'approved' ? 'Approved' : 'Needs Rework'}`,
      message: `[Review] ${task.title}`,
      link: `/task/${task._id}`,
      workspaceId: task.workspaceId
    });

    try {
      getIO().to(task.assignedUser.toString()).emit(EVENTS.NOTIFICATION_RECEIVED, notification);
    } catch (err) {}
  }

  await invalidateCache(user.workspaceId, '*task*');

  try {
    getIO().to(task.project.toString()).emit(EVENTS.TASK_UPDATED, { 
      type: 'UPDATE', 
      taskId: task._id, 
      status: task.status,
      reviewStatus: task.reviewStatus,
      projectId: task.project
    });
  } catch (err) {}

  return task;
};

module.exports = {
  updateTaskStatus,
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  getMyTasks,
  toggleTaskBlockage,
  updateTaskSteps,
  deleteTask,
  submitTaskReview,
};
