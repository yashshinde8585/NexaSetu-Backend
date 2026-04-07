const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const aiService = require('./aiService');
const { cacheGet, cacheSet } = require('../utils/redisCache');
const prompts = require('../config/prompts.json');

/**
 * EPI Service
 * Handles project intelligence and template management.
 */

const formatTemplate = (template, data) => {
  let result = template;
  Object.keys(data).forEach(key => {
    result = result.replace(`{{${key}}}`, data[key]);
  });
  return result;
};

exports.getSprintEPI = async (sprintId) => {
  const cacheKey = `epi:sprint:${sprintId}`;
  const cachedData = await cacheGet(cacheKey);
  if (cachedData) return { ...cachedData, cached: true };

  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error('Sprint not found');
  const tasks = await Task.find({ sprint: sprintId });
  
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const completionPercentage = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  const timeElapsedPercentage = Math.min(100, ((new Date() - sprint.startDate) / (sprint.endDate - sprint.startDate)) * 100);

  const blockers = tasks.filter(t => t.dependencies?.length > 0 && t.status !== 'done');
  const criticalPathSummary = [];
  for (const task of blockers) {
    const bTasks = await Task.find({ _id: { $in: task.dependencies }, status: { $ne: 'done' } });
    if (bTasks.length > 0) criticalPathSummary.push(`- "${task.title}" blocked by: ${bTasks.map(bt => bt.title).join(', ')}`);
  }

  const userPrompt = formatTemplate(prompts.templates.EPI_SUMMARY, {
    name: sprint.name,
    goal: sprint.goal,
    donePercentage: completionPercentage.toFixed(1),
    timePercentage: timeElapsedPercentage.toFixed(1),
    status: sprint.status,
    healthScore: sprint.healthScore,
    blockers: criticalPathSummary.length > 0 ? criticalPathSummary.join('\n') : 'None.'
  });

  const [narrative, predictions, suggestedActions] = await Promise.all([
    aiService.processPrompt(prompts.system.EPI_ENGINE, userPrompt, { highReasoning: false, temperature: 0.4 }),
    getPredictiveAnalysis(sprintId, tasks, sprint),
    getSuggestedActions(sprintId, criticalPathSummary, tasks)
  ]);

  const finalResponse = {
    sprintName: sprint.name,
    metrics: { completionPercentage, timeElapsedPercentage, healthScore: sprint.healthScore },
    criticalBlockers: criticalPathSummary,
    narrative,
    suggestedActions,
    predictions
  };

  await cacheSet(cacheKey, finalResponse, 600);
  return finalResponse;
};

const getPredictiveAnalysis = async (sprintId, tasks, sprint) => {
    const doneTasks = tasks.filter(t => t.status === 'done');
    const totalDoneEffort = doneTasks.reduce((sum, t) => sum + (t.estimatedDuration || 60), 0);
    const sprintDaysElapsed = Math.max(1, (new Date() - sprint.startDate) / (24 * 60 * 60 * 1000));
    const velocityPerDay = totalDoneEffort / sprintDaysElapsed;
    const remainingTasks = tasks.filter(t => t.status !== 'done');
    const totalRemainingEffort = remainingTasks.reduce((sum, t) => sum + (t.estimatedDuration || 60), 0);
    const remainingDays = Math.max(0.1, (sprint.endDate - new Date()) / (24 * 60 * 60 * 1000));
    const requiredVelocity = totalRemainingEffort / remainingDays;
    const riskScore = velocityPerDay > 0 ? (requiredVelocity / velocityPerDay) : 1;

    const userPrompt = formatTemplate(prompts.templates.FORESIGHT_ANALYSIS, {
        velocity: velocityPerDay.toFixed(1),
        neededVelocity: requiredVelocity.toFixed(1),
        riskScore: riskScore.toFixed(1),
        pendingCount: remainingTasks.length,
        dependencyCount: remainingTasks.filter(t => t.dependencies?.length > 0).length,
        daysRemaining: Math.ceil(remainingDays)
    });
    
    const foresight = await aiService.processPrompt(prompts.system.FORESIGHT_ENGINE, userPrompt, { highReasoning: false, temperature: 0.1 });

    return {
        riskLevel: riskScore > 1.5 ? 'CRITICAL' : riskScore > 1.1 ? 'MEDIUM' : 'LOW',
        foresight,
        predictedCompletionDate: riskScore > 1 && velocityPerDay > 0 ? 
            new Date(new Date().getTime() + (totalRemainingEffort / velocityPerDay) * 24 * 60 * 60 * 1000) : 
            sprint.endDate
    };
};

const getSuggestedActions = async (sprintId, pathSummary, tasks) => {
  const actions = [];
  if (pathSummary.length > 0) {
      actions.push({ type: 'priority_bump', title: 'Clear Delivery Obstacles', description: 'Upgrade blocking items to Urgent priority.', impact: 'high', metadata: { sprintId } });
  }
  const userLoads = {};
  tasks.filter(t => t.assignedUser && t.status !== 'done').forEach(t => {
    userLoads[t.assignedUser] = (userLoads[t.assignedUser] || 0) + 1;
  });
  const overloadedUser = Object.keys(userLoads).find(uid => userLoads[uid] > 3);
  if (overloadedUser) {
    const freeUser = Object.keys(userLoads).find(uid => userLoads[uid] < 2);
    if (freeUser && overloadedUser !== freeUser) {
      const taskToMove = tasks.find(t => t.assignedUser?.toString() === overloadedUser && t.status === 'todo');
      if (taskToMove) {
        actions.push({ type: 'reassign', title: 'Balance Work Distribution', description: `Hand off "${taskToMove.title}" to available capacity.`, impact: 'medium', metadata: { taskId: taskToMove._id, toUserId: freeUser } });
      }
    }
  }
  return actions;
};

exports.executeAction = async (actionType, metadata) => {
    if (actionType === 'reassign') {
        await Task.findByIdAndUpdate(metadata.taskId, { assignedUser: metadata.toUserId });
        return { success: true };
    }
    if (actionType === 'priority_bump') {
        await Task.updateMany({ sprint: metadata.sprintId, status: { $ne: 'done' }, dependencies: { $exists: true, $ne: [] } }, { priority: 'urgent' });
        return { success: true };
    }
    throw new Error('Unsupported action type');
};

exports.getTaskEPI = async (taskId) => {
    const task = await Task.findById(taskId).populate('dependencies');
    if (!task) throw new Error('Task not found');
    const isDelayed = task.dueDate && new Date() > task.dueDate && task.status !== 'done';
    
    const userPrompt = formatTemplate(prompts.templates.TASK_EXPLANATION, {
        title: task.title,
        description: task.description || 'No detailed description provided.',
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate ? task.dueDate.toDateString() : 'None',
        blockerCount: task.dependencies.filter(d => d.status !== 'done').length,
        history: JSON.stringify(task.timelineHistory?.slice(-3))
    });

    const explanation = await aiService.processPrompt(prompts.system.ROOT_CAUSE_ANALYST, userPrompt, { highReasoning: false, temperature: 0.3 });
    return { taskId: task._id, isDelayed, blockersCount: task.dependencies.filter(d => d.status !== 'done').length, explanation };
};

exports.getTaskImplementationHelp = async (taskId) => {
    const task = await Task.findById(taskId).populate('sprint');
    if (!task) throw new Error('Task not found');
    
    const userPrompt = formatTemplate(prompts.templates.IMPLEMENTATION_HELP, {
        title: task.title,
        description: task.description || 'No detailed description provided.',
        goal: task.sprint?.goal || 'General project delivery'
    });

    const help = await aiService.processPrompt(
        prompts.system.IMPLEMENTATION_ADVISOR || "You are a Senior Technical Consultant helping a developer finish a task.", 
        userPrompt, 
        { highReasoning: true, temperature: 0.3 }
    );

    return { taskId: task._id, implementationPlan: help };
};

exports.generateNarrativeReport = async (sprintId, stakeholderType = 'EXECUTIVE') => {
    const sprint = await Sprint.findById(sprintId);
    if (!sprint) throw new Error('Sprint not found');
    const tasks = await Task.find({ sprint: sprintId });
    
    const userPrompt = formatTemplate(prompts.templates.STAKEHOLDER_REPORT, {
        name: sprint.name,
        doneCount: tasks.filter(t => t.status === 'done').length,
        totalCount: tasks.length,
        riskCount: tasks.filter(t => t.dueDate && new Date() > t.dueDate && t.status !== 'done').length,
        goal: sprint.goal
    });

    const systemPrompt = prompts.system.STAKEHOLDER_BRIEFING[stakeholderType] || prompts.system.STAKEHOLDER_BRIEFING.EXECUTIVE;
    const content = await aiService.processPrompt(systemPrompt, userPrompt, { highReasoning: true, temperature: 0.7 });

    return { sprint: sprint.name, type: stakeholderType, content, summary: { total: tasks.length, done: tasks.filter(t => t.status === 'done').length }, generatedAt: new Date() };
};
