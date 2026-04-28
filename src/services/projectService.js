const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const auditService = require('../services/auditService');
const { calculateDelayStatus } = require('../utils/taskUtils');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const { isManagerOrAdmin, hasLeadRestriction } = require('../utils/authHelpers');
const AppError = require('../utils/appError');
const metricsService = require('./metricsService');
const logger = require('../utils/logger');

class ProjectService {
  async createProject(user, data) {
    const { name, sprint } = data;

    if (!isManagerOrAdmin(user) || hasLeadRestriction(user)) {
      throw new AppError('You do not have permission to create projects.', 403);
    }

    if (!name) {
      throw new AppError('Project name is required', 400);
    }

    if (!user.workspaceId) {
      throw new AppError('Tactical Workspace context is missing. Please re-authenticate.', 400);
    }

    const sprintId = sprint && sprint.trim() && mongoose.Types.ObjectId.isValid(sprint) ? sprint : undefined;

    // Generate a unique project key
    let key = name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
    if (key.length < 3) key = (key + 'XXX').substring(0, 3);
    
    let uniqueKey = key;
    let counter = 1;
    while (await Project.findOne({ workspaceId: user.workspaceId, key: uniqueKey })) {
      uniqueKey = `${key}${counter}`;
      counter++;
    }

    const project = await Project.create({
      name,
      key: uniqueKey,
      description: data.description,
      type: data.type,
      priority: data.priority,
      status: data.status,
      sprint: sprintId,
      createdBy: user._id,
      members: [user._id],
      workspaceId: user.workspaceId,
    });

    await auditService.log({
      action: 'CREATE_PROJECT',
      performer: user._id,
      entityType: 'PROJECT',
      entityId: project._id,
      details: { name: project.name },
    });

    // Fire-and-forget metrics hook
    metricsService.trackEvent(user, 'project_created', { 
      projectId: project._id, 
      type: project.type 
    }).catch(err => logger.error(`[METRICS] Failed to track project creation: ${err.message}`));

    return project;
  }

  async getProjects(user, page = 1, limit = 20) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitValue = parseInt(limit);
    const query = getProjectAccessQuery(user);

    const projects = await Project.find(query)
      .populate('createdBy', 'name email role')
      .populate('members', 'name email role')
      .skip(skip)
      .limit(limitValue)
      .sort('-createdAt')
      .lean();

    const total = await Project.countDocuments(query);

    return { projects, total, page: parseInt(page), limit: limitValue };
  }

  async getProject(user, id) {
    const query = getProjectAccessQuery(user);
    query._id = id;

    const project = await Project.findOne(query).populate('members', 'name email role');

    if (!project) {
      const exists = await Project.findById(id);
      if (!exists) {
        throw new AppError('Mission footprint not found in the central ledger.', 404);
      }
      throw new AppError('You lack the tactical credentials to view this project.', 403);
    }

    return project;
  }

  async getProjectAnalytics(user, id, sprintId) {
    const query = getProjectAccessQuery(user);
    query._id = id;

    const project = await Project.findOne(query);

    if (!project) {
      const exists = await Project.findById(id);
      if (!exists) {
        throw new AppError('Mission footprint not found in the central ledger.', 404);
      }
      throw new AppError('You lack the tactical credentials to access these analytics.', 403);
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

    const tasks = await Task.aggregate(pipeline);
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

    return { analytics, tasks: tasksWithDelayStatus };
  }

  async updateProject(user, id, updateData) {
    const project = await Project.findOne({
      _id: id,
      workspaceId: user.workspaceId,
    });
    if (!project) {
      throw new AppError('No project found with that ID in your workspace', 404);
    }

    const isMember = project.members.some(
      (m) => m.toString() === user.id.toString()
    );
    const isManager = isManagerOrAdmin(user) && !hasLeadRestriction(user);

    const isOnlySprintUpdate =
      Object.keys(updateData).length === 1 && 'sprint' in updateData;

    if (!isManager && (!isMember || !isOnlySprintUpdate)) {
      throw new AppError('You do not have permission to update tactical settings for this mission.', 403);
    }

    const updatedProject = await Project.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate('members', 'name email role');

    return updatedProject;
  }
}

module.exports = new ProjectService();
