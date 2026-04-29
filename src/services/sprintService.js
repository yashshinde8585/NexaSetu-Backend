const Sprint = require('../models/Sprint');
const Project = require('../models/Project');
const Task = require('../models/Task');
const AppError = require('../utils/appError');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const { invalidateCache } = require('../middleware/cacheMiddleware');

class SprintService {
  async createSprint(user, data) {
    const { name, startDate, endDate, status, project, goal } = data;

    if (!name || !startDate || !endDate) {
      throw new AppError('Please provide sprint name, start date, end date', 400);
    }

    const sprint = await Sprint.create({
      name,
      goal,
      startDate,
      endDate,
      status: status || 'upcoming',
      project,
      createdBy: user._id,
      workspaceId: user.workspaceId,
    });

    await invalidateCache(user.workspaceId, 'sprint');

    return sprint;
  }

  async getAllSprints(user, projectId) {
    let filter = { workspaceId: user.workspaceId };

    if (projectId) {
      filter.project = projectId;
    } else {
      const isGlobalViewer = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'TECH_LEAD'].includes(user.role);
      
      if (!isGlobalViewer) {
        const accessibleProjects = await Project.find(getProjectAccessQuery(user)).select('_id');
        const projectIds = accessibleProjects.map(p => p._id);
        filter.$or = [
          { project: { $in: projectIds } },
          { project: { $in: [null, undefined] } },
          { createdBy: user._id }
        ];
      }
    }

    const sprints = await Sprint.find(filter)
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    return sprints;
  }

  async getSprint(id) {
    const sprint = await Sprint.findById(id).populate('project');
    if (!sprint) {
      throw new AppError('No sprint found with that ID', 404);
    }
    return sprint;
  }

  async updateSprint(id, data) {
    const sprint = await Sprint.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!sprint) {
      throw new AppError('No sprint found with that ID', 404);
    }

    await invalidateCache(sprint.workspaceId, 'sprint');

    return sprint;
  }

  async deleteSprint(id) {
    const sprint = await Sprint.findByIdAndDelete(id);
    if (!sprint) {
      throw new AppError('No sprint found with that ID', 404);
    }

    await invalidateCache(sprint.workspaceId, 'sprint');

    return sprint;
  }

  async syncSprintHealth(id) {
    const sprint = await Sprint.findById(id);
    if (!sprint) throw new AppError('Sprint not found', 404);

    const tasks = await Task.find({ sprint: sprint._id });
    
    if (tasks.length === 0) {
      sprint.healthScore = 100;
    } else {
      const doneTasks = tasks.filter(t => t.status === 'done');
      
      const completionRate = doneTasks.length / tasks.length;
      const now = new Date();
      const totalTime = sprint.endDate - sprint.startDate;
      const elapsed = now - sprint.startDate;
      const timeProgress = Math.min(Math.max(elapsed / totalTime, 0), 1);
      
      const drift = completionRate - timeProgress;
      sprint.healthScore = Math.max(0, Math.min(100, Math.round((1 + drift) * 50 + 50)));
      
      sprint.pressureIndex = Math.min(1, tasks.filter(t => t.status !== 'done').length / (tasks.length || 1));
    }

    sprint.metricsSnapshot.push({
      burnRate: (tasks.filter(t => t.status === 'done').length / tasks.length) || 0,
      completionPercentage: (tasks.filter(t => t.status === 'done').length / tasks.length) * 100,
      pressure: sprint.pressureIndex
    });

    await sprint.save();

    return {
      healthScore: sprint.healthScore,
      pressureIndex: sprint.pressureIndex
    };
  }
}

module.exports = new SprintService();
