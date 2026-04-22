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
const { sanitizeHTML } = require('../utils/sanitizer');
const { STORAGE_CONSTANTS } = require('../utils/constants');
const storageQueue = require('../queues/storageQueue');
const storageService = require('../services/storageService');

class TaskService {
  // Calculates and persists active work time when mission state changes.
  _updateTaskTimeTracking(task, newStatus) {
    const now = new Date();
    const isCurrentlyActive = (task.status === 'in_progress' && !task.blocked);
    const willBeActive = (newStatus === 'in_progress');

    // Deduct elapsed time only when transitioning away from an active state
    if (isCurrentlyActive && !willBeActive && task.lastStartedAt) {
      const elapsedMinutes = Math.max(0, (now - task.lastStartedAt) / (1000 * 60));
      task.remainingDuration = Math.max(0, (task.remainingDuration || task.estimatedDuration) - elapsedMinutes);
      task.lastStartedAt = null;
    }
    
    // Mark session start for active work tracking
    if (willBeActive && !isCurrentlyActive) {
      task.lastStartedAt = now;
      if (task.remainingDuration === undefined || task.remainingDuration === null) {
        task.remainingDuration = task.estimatedDuration;
      }
    }

    if (newStatus === 'done') {
      task.remainingDuration = 0;
      task.completedAt = now;
      
      const start = task.startedAt || task.createdAt;
      task.actualDuration = Math.round((now - start) / (1000 * 60));
    }
  }

  async updateTaskStatus(user, taskId, status) {
    try {
      const task = await Task.findById(taskId);
      if (!task) {
        throw new AppError('No mission found with that ID', 404);
      }

      const oldStatus = task.status;
      if (oldStatus === status) return task;

      // Prevent non-privileged users from reversing terminal states (Done/Archived)
      const terminalStates = ['done', 'archived'];
      if (terminalStates.includes(oldStatus) && !['todo', 'in_progress'].includes(status) && !isManagerOrAdmin(user)) {
        throw new AppError(`Action Denied: Cannot move a mission from ${oldStatus} to ${status} without manager approval.`, 403);
      }

      this._updateTaskTimeTracking(task, status);
      task.status = status;
      task.timelineHistory.push({
        status,
        timestamp: Date.now(),
        reason: `System: Status transitioned from ${oldStatus || 'unknown'} to ${status} by ${user?.name || 'Authorized Performer'}`,
      });

      await task.save();

      await commentController.logActivity(
        taskId,
        user._id,
        `Status transitioned from ${oldStatus} to ${status}`
      );

      return task;
    } catch (error) {
      throw error;
    }
  }

  async createTask(user, data) {
    try {
      const {
        title, description, project, assignedUser, status, source,
        isAiGenerated, dueDate, sprint, priority, estimatedDuration, attachments
      } = data;

      const query = getProjectAccessQuery(user);
      query._id = project;
      const projectDoc = await Project.findOne(query);
      if (!projectDoc) {
        throw new AppError('Project not found or you are not a member', 404);
      }

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
        priority: priority || 'medium',
        estimatedDuration: estimatedDuration || 30,
        remainingDuration: estimatedDuration || 30,
        createdBy: user._id,
        workspaceId: projectDoc.workspaceId,
        attachments: attachments || [],
      };

      // Enterprise Hardening: Verify Quota
      const totalNewSize = taskData.attachments.reduce((acc, a) => acc + a.size, 0);
      const hasQuota = await storageService.checkQuota(taskData.workspaceId, totalNewSize);
      if (!hasQuota) {
        throw new AppError('Storage quota exceeded for this workspace. Please upgrade or delete old assets.', 403);
      }

      // Hardened metadata validation for attachments
      if (taskData.attachments.length > 0) {
        for (const file of taskData.attachments) {
          storageService.validateAttachment(file, {
            workspaceId: projectDoc.workspaceId.toString(),
            projectId: project,
            taskId: 'new' 
          });

          // Anti-Spoofing: Verify file actually exists in storage
          const isVerified = await storageService.verifyAttachment(file.storagePath, file.size);
          if (!isVerified) {
            throw new AppError(`Integrity Failure: File ${file.name} could not be verified in storage.`, 400);
          }
        }
      }

      // Cross-tenant data protection: Verify assignee belongs to the same workspace
      if (assignedUser) {
        const User = require('../models/User');
        const assignee = await User.findById(assignedUser);
        if (!assignee) {
          throw new AppError('Integrity Error: The assigned performer does not exist.', 400);
        }
        if (assignee.workspaceId.toString() !== projectDoc.workspaceId.toString()) {
          throw new AppError('Integrity Violation: Performer must belong to the same workspace as the mission.', 400);
        }
      }

      if (taskData.status === 'in_progress') {
        taskData.startedAt = new Date();
        taskData.lastStartedAt = new Date();
      } else if (taskData.status === 'done') {
        taskData.startedAt = taskData.startedAt || new Date();
        taskData.completedAt = new Date();
        taskData.actualDuration = 0;
      }

      const task = await Task.create(taskData);

      // Persist storage usage update
      await storageService.updateStorageUsage(task.workspaceId, totalNewSize);

      // Audit trail for initial task state
      await TaskStatusHistory.create({
        task: task._id,
        fromStatus: 'none',
        toStatus: task.status,
        changedBy: user?._id,
      });

      // Signal autonomous agents to evaluate the new task context for dependencies or automation
      await AgentOrchestrator.handleEvent({
        type: 'TASK_CREATED',
        entityId: task._id,
        entityType: 'task',
        project: task.project,
        payload: task,
      });

      // Notify the performer only if they didn't create the task themselves
      if (task.assignedUser && task.assignedUser.toString() !== user._id.toString()) {
        const ticketId = `${projectDoc.key || 'NEXA'}-${task.taskNumber || 'NEW'}`;
        await Notification.create({
          recipient: task.assignedUser,
          sender: user._id,
          type: 'TASK_ASSIGNED',
          title: user.name,
          message: `[${ticketId}] ${task.title}`,
          link: `/task/${task._id}`,
          workspaceId: task.workspaceId
        });
      }

      return task;
    } catch (error) {
      console.error('[TASK-SERVICE] Create Task Error:', error);
      throw error;
    }
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

    // Secure Signed Download URLs for private storage
    if (taskObj.attachments && taskObj.attachments.length > 0) {
      const enrichmentPromises = taskObj.attachments.map(async (att) => {
        const signedUrl = await storageService.getSignedDownloadUrl(att.storagePath);
        return { ...att, url: signedUrl || att.url }; // Fallback to original if signing fails
      });
      taskObj.attachments = await Promise.all(enrichmentPromises);
    }

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

    const allowedFields = ['title', 'description', 'assignedUser', 'dueDate', 'priority', 'estimatedDuration', 'attachments'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = ['title', 'description'].includes(field) 
          ? sanitizeHTML(data[field]) 
          : data[field];
      }
    });

    // Validate new attachments if provided
    if (updateData.attachments) {
      const totalNewSize = updateData.attachments.reduce((acc, a) => acc + a.size, 0);
      const hasQuota = await storageService.checkQuota(project.workspaceId, totalNewSize);
      if (!hasQuota) {
        throw new AppError('Storage quota exceeded. Please upgrade your workspace.', 403);
      }

      for (const file of updateData.attachments) {
        storageService.validateAttachment(file, {
          workspaceId: project.workspaceId.toString(),
          projectId: task.project.toString(),
          taskId: task._id.toString()
        });

        const isVerified = await storageService.verifyAttachment(file.storagePath, file.size);
        if (!isVerified) {
          throw new AppError(`Integrity Failure: File ${file.name} could not be verified in storage.`, 400);
        }
      }
      
      // Update usage
      await storageService.updateStorageUsage(project.workspaceId, totalNewSize);
    }

    // Optimistic Concurrency Control (OCC): Prevents 'lost updates' in collaborative environments
    const clientVersion = data.version !== undefined ? data.version : data.__v;
    
    if (clientVersion === undefined) {
      throw new AppError('Conflict Prevention: Version number is required for updates.', 400);
    }

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

    // Atomic update with version check
    const updatedTask = await Task.findOneAndUpdate(
      { _id: id, __v: clientVersion },
      { $set: updateData, $inc: { __v: 1 } },
      {
        returnDocument: 'after',
        runValidators: true,
      }
    ).populate('assignedUser', 'name email');

    if (!updatedTask) {
      throw new AppError('Conflict Detected: This task has been modified by another session. Please refresh and try again.', 409);
    }

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
      task.blockedReason = sanitizeHTML(reason) || 'Waiting on external dependency';
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
  
  async deleteTask(user, taskId) {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new AppError('No mission found with that ID', 404);
    }

    const query = getProjectAccessQuery(user);
    query._id = task.project;
    const project = await Project.findOne(query);
    
    // Only admins or managers can delete tasks, or the creator
    const isOwner = task.createdBy?.toString() === user._id.toString();
    if (!isManagerOrAdmin(user) && !isOwner) {
      throw new AppError('Action Denied: You do not have permission to terminate this mission.', 403);
    }

    // If there are attachments, trigger cleanup job
    if (task.attachments && task.attachments.length > 0) {
      const storagePaths = task.attachments.map(a => a.storagePath);
      const totalDeletedSize = task.attachments.reduce((acc, a) => acc + a.size, 0);
      
      await storageQueue.add('cleanup-orphans', { storagePaths });
      
      // Decrement storage usage
      await storageService.updateStorageUsage(task.workspaceId, -totalDeletedSize);
    }

    await Task.findByIdAndDelete(taskId);

    await commentController.logActivity(
      taskId,
      user._id,
      'MISSION TERMINATED (Deleted)'
    );

    return true;
  }
}

module.exports = new TaskService();
