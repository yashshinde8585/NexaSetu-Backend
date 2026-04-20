const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const TaskStatusHistory = require('../models/TaskStatusHistory');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { calculateDelayStatus } = require('../utils/taskUtils');
const { isManagerOrAdmin } = require('../utils/authHelpers');
const { getTaskAccessQuery, getProjectAccessQuery } = require('../utils/queryHelpers');
const { formatDueDate } = require('../utils/dashboardHelpers');
const AppError = require('../utils/appError');
const commentController = require('../controllers/commentController'); // Note: should ideally be a service

class TaskService {
  _updateTaskTimeTracking(task, newStatus) {
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
  }

  async updateTaskStatus(user, taskId, status) {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new AppError('No mission found with that ID', 404);
    }

    const oldStatus = task.status;
    this._updateTaskTimeTracking(task, status);
    task.status = status;
    task.timelineHistory.push({
      status,
      timestamp: Date.now(),
      reason: `System: Status transitioned from ${oldStatus} to ${status} by ${user.name}`,
    });

    await task.save();

    await commentController.logActivity(
      taskId,
      user._id,
      `Status transitioned from ${oldStatus} to ${status}`
    );

    return task;
  }

  async createTask(user, data) {
    const {
      title, description, project, assignedUser, status, source,
      isAiGenerated, dueDate, sprint, priority, estimatedDuration,
    } = data;

    const query = getProjectAccessQuery(user);
    query._id = project;
    const projectDoc = await Project.findOne(query);
    if (!projectDoc) {
      throw new AppError('Project not found or you are not a member', 404);
    }

    const taskData = {
      title, description, project, sprint,
      assignedUser: assignedUser || null,
      status: status || 'todo',
      source: source || 'manual',
      isAiGenerated: isAiGenerated || false,
      dueDate: dueDate || null,
      priority: priority || 'medium',
      estimatedDuration: estimatedDuration || 30,
      remainingDuration: estimatedDuration || 30,
      createdBy: user._id,
      workspaceId: projectDoc.workspaceId,
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
      payload: task,
    });

    if (task.assignedUser && task.assignedUser.toString() !== user._id.toString()) {
      const ticketId = `${projectDoc.key || 'NEXA'}-${task.taskNumber || 'NEW'}`;
      await Notification.create({
        recipient: task.assignedUser,
        sender: user._id,
        type: 'TASK_ASSIGNED',
        title: user.name,
        message: `[${ticketId}] ${task.title}`,
        link: `/task/${task._id}`,
        workspaceId: user.workspaceId
      });
    }

    return task;
  }

  async getTasks(user, projectId, sprintId, page = 1, limit = 50) {
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
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          assignedUser: { $arrayElemAt: ['$assignedUserData', 0] },
          projectKey: project.key || 'NEXA',
          sprintInfo: { $arrayElemAt: ['$sprintData', 0] },
        },
      },
      { $project: { assignedUserData: 0, sprintData: 0 } },
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

    return { tasks: enrichedTasks, totalTasks, page: parseInt(page), limit: limitValue };
  }

  async getTaskById(user, id) {
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
      throw new AppError('Access denied to this project task', 403);
    }

    const taskObj = task.toObject();
    taskObj.delayStatus = calculateDelayStatus(taskObj);
    taskObj.projectKey = task.project.key || 'NEXA';
    taskObj.sprintInfo = taskObj.sprint; 
    taskObj.createdFormatted = formatDueDate(taskObj.createdAt);

    return taskObj;
  }

  async updateTask(user, id, data) {
    const { title, description, status, assignedUser, dueDate, priority, estimatedDuration } = data;

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

    const allowedFields = ['title', 'description', 'assignedUser', 'dueDate', 'priority', 'estimatedDuration'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) updateData[field] = data[field];
    });

    if (status && status !== task.status) {
      this._updateTaskTimeTracking(task, status);
      updateData.status = status;
      updateData.remainingDuration = task.remainingDuration;
      updateData.lastStartedAt = task.lastStartedAt;

      if (status === 'in_progress' && !task.startedAt) {
        updateData.startedAt = new Date();
      }

      if (status === 'done') {
        updateData.completedAt = new Date();
        const start = task.startedAt || task.createdAt;
        updateData.actualDuration = Math.round((new Date() - start) / (1000 * 60));
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

    if (assignedUser && assignedUser.toString() !== task.assignedUser?.toString()) {
      const ticketId = `${project.key || 'NEXA'}-${updatedTask.taskNumber || 'MEMO'}`;
      await Notification.create({
        recipient: assignedUser,
        sender: user._id,
        type: 'TASK_ASSIGNED',
        title: user.name,
        message: `[${ticketId}] ${updatedTask.title}`,
        link: `/task/${updatedTask._id}`,
        workspaceId: user.workspaceId
      });
    }

    if (status && status !== task.status) {
      await TaskStatusHistory.create({
        task: updatedTask._id,
        fromStatus: task.status,
        toStatus: status,
        changedBy: user?._id,
      });
    }

    await AgentOrchestrator.handleEvent({
      type: 'TASK_UPDATED',
      entityId: updatedTask._id,
      entityType: 'task',
      project: updatedTask.project,
      payload: updatedTask,
    });

    return updatedTask;
  }

  async getMyTasks(user, scope, page = 1, limit = 20) {
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
  }

  async toggleTaskBlockage(user, taskId, blocked, reason) {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new AppError('No mission found with that ID', 404);
    }

    task.blocked = blocked;
    
    if (blocked) {
      task.blockedAt = new Date();
      task.blockedReason = reason || 'Waiting on external dependency';
    } else {
      task.blockedAt = null;
      task.blockedReason = null;
    }

    await task.save();

    const actionText = blocked ? `MISSION BLOCKED: ${reason}` : 'MISSION UNBLOCKED';
    await commentController.logActivity(
      taskId,
      user._id,
      actionText
    );

    return task;
  }
}

module.exports = new TaskService();
