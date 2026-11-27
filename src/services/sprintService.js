const mongoose = require('mongoose');
const Sprint = require('../models/Sprint');
const Project = require('../models/Project');
const Task = require('../models/Task');
const AppError = require('../utils/appError');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const { invalidateCache } = require('../middlewares/cacheMiddleware');
const { runInTransaction } = require('../utils/dbUtils');

const ensureSprintProjectAccess = async (user, projectRef) => {
  if (!projectRef) return;
  const projectId = projectRef._id || projectRef;
  const accessQuery = getProjectAccessQuery(user);
  const hasAccess = await Project.exists({ ...accessQuery, _id: projectId });
  if (!hasAccess) {
    throw new AppError('You do not have access to this project', 403);
  }
};

const createSprint = async (user, data) => {
  const { name, startDate, endDate, status, project, goal, description } = data;

  if (!name || !startDate || !endDate) {
    throw new AppError('Please provide sprint name, start date, end date', 400);
  }

  if (project) {
    await ensureSprintProjectAccess(user, project);
  }

  const sprint = await Sprint.create({
    name,
    goal,
    ...(description !== undefined ? { description } : {}),
    startDate,
    endDate,
    status: status || 'upcoming',
    project,
    createdBy: user._id,
    workspaceId: user.workspaceId,
  });

  await invalidateCache(user.workspaceId, 'sprint');

  return sprint;
};

const getAllSprints = async (user, projectId) => {
  let filter = { workspaceId: user.workspaceId };

  if (projectId) {
    await ensureSprintProjectAccess(user, projectId);
    filter.project = projectId;
  } else {
    const isGlobalViewer = [
      'WORKSPACE_ADMIN',
      'WORKSPACE_MANAGER',
      'TECH_LEAD',
    ].includes(user.role);

    if (!isGlobalViewer) {
      const accessibleProjects = await Project.find(
        getProjectAccessQuery(user)
      ).select('_id');
      const projectIds = accessibleProjects.map((p) => p._id);
      filter.$or = [
        { project: { $in: projectIds } },
        { project: { $in: [null, undefined] } },
        { createdBy: user._id },
      ];
    }
  }

  const sprints = await Sprint.find(filter)
    .populate('project', 'name')
    .sort({ createdAt: -1 });

  return sprints;
};

const getSprint = async (user, id) => {
  const sprint = await Sprint.findOne({
    _id: id,
    workspaceId: user.workspaceId,
  }).populate('project');
  if (!sprint) {
    throw new AppError('No sprint found with that ID', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);
  return sprint;
};

const updateSprint = async (user, id, data) => {
  const existing = await Sprint.findOne({
    _id: id,
    workspaceId: user.workspaceId,
  });
  if (!existing) {
    throw new AppError('No sprint found with that ID', 404);
  }
  await ensureSprintProjectAccess(user, existing.project);

  const sprint = await Sprint.findOneAndUpdate(
    { _id: id, workspaceId: user.workspaceId },
    data,
    {
      new: true,
      runValidators: true,
    }
  );
  if (!sprint) {
    throw new AppError('No sprint found with that ID', 404);
  }

  await invalidateCache(sprint.workspaceId, 'sprint');

  return sprint;
};

const deleteSprint = async (user, id) => {
  const sprint = await Sprint.findOne({
    _id: id,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('No sprint found with that ID', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);
  if (sprint.status === 'completed') {
    throw new AppError(
      'Completed sprints cannot be deleted as they preserve historical audit records',
      400
    );
  }

  let deletedSprint = null;
  await runInTransaction(async (session) => {
    const sessionOpts = session ? { session } : {};

    deletedSprint = await Sprint.findOneAndDelete(
      { _id: id, workspaceId: user.workspaceId, status: { $ne: 'completed' } },
      sessionOpts
    );
    if (!deletedSprint) {
      throw new AppError(
        'Sprint could not be deleted because it was already completed or removed',
        409
      );
    }

    // Safely release any tasks assigned to this sprint back to product backlog
    await Task.updateMany(
      { sprint: id, workspaceId: user.workspaceId },
      { $set: { sprint: null } },
      sessionOpts
    );
  });

  await invalidateCache(sprint.workspaceId, 'sprint');

  return deletedSprint;
};

const syncSprintHealth = async (user, id) => {
  const sprint = await Sprint.findOne({
    _id: id,
    workspaceId: user.workspaceId,
  });
  if (!sprint) throw new AppError('Sprint not found', 404);
  await ensureSprintProjectAccess(user, sprint.project);

  const tasks = await Task.find({ sprint: sprint._id });

  if (tasks.length === 0) {
    sprint.healthScore = 100;
  } else {
    const doneTasks = tasks.filter((t) => t.status === 'done');

    const completionRate = doneTasks.length / tasks.length;
    const now = new Date();
    const totalTime = sprint.endDate - sprint.startDate;
    const elapsed = now - sprint.startDate;
    const timeProgress = Math.min(Math.max(elapsed / totalTime, 0), 1);

    const drift = completionRate - timeProgress;
    sprint.healthScore = Math.max(
      0,
      Math.min(100, Math.round((1 + drift) * 50 + 50))
    );

    sprint.pressureIndex = Math.min(
      1,
      tasks.filter((t) => t.status !== 'done').length / (tasks.length || 1)
    );
  }

  const totalCount = tasks.length;
  sprint.metricsSnapshot.push({
    burnRate:
      totalCount > 0
        ? tasks.filter((t) => t.status === 'done').length / totalCount
        : 0,
    completionPercentage:
      totalCount > 0
        ? (tasks.filter((t) => t.status === 'done').length / totalCount) * 100
        : 0,
    pressure: sprint.pressureIndex,
  });

  await sprint.save();

  return {
    healthScore: sprint.healthScore,
    pressureIndex: sprint.pressureIndex,
  };
};

const startSprint = async (user, id) => {
  const sprint = await Sprint.findOne({
    _id: id,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);
  if (sprint.status === 'completed') {
    throw new AppError('Cannot start a completed sprint', 400);
  }
  if (sprint.status === 'active') {
    return sprint;
  }

  const tasks = await Task.find({
    sprint: sprint._id,
    workspaceId: user.workspaceId,
  });

  const committedTasksCount = tasks.length;
  const committedPoints = tasks.reduce(
    (sum, t) => sum + (typeof t.storyPoints === 'number' ? t.storyPoints : 0),
    0
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const dailySnapshots = [
    {
      date: todayStr,
      idealRemaining: committedPoints,
      actualRemaining: committedPoints,
      totalCommitted: committedPoints,
      completedPoints: 0,
      tasksDone: 0,
      tasksRemaining: committedTasksCount,
    },
  ];

  // Atomic transition ensures concurrent start requests cannot overwrite startedAt or initial snapshots
  const activatedSprint = await Sprint.findOneAndUpdate(
    { _id: id, workspaceId: user.workspaceId, status: 'upcoming' },
    {
      $set: {
        status: 'active',
        startedAt: new Date(),
        committedTasksCount,
        committedPoints,
        pointsTarget:
          !sprint.pointsTarget || sprint.pointsTarget === 0
            ? committedPoints
            : sprint.pointsTarget,
        dailySnapshots,
      },
    },
    { returnDocument: 'after' }
  );

  if (!activatedSprint) {
    const latest = await Sprint.findOne({
      _id: id,
      workspaceId: user.workspaceId,
    });
    if (latest && latest.status === 'active') {
      return latest;
    }
    throw new AppError(
      'Sprint could not be started because its status changed',
      409
    );
  }

  await invalidateCache(activatedSprint.workspaceId, 'sprint');
  return activatedSprint;
};

const completeSprint = async (user, id, data = {}) => {
  const { rolloverAction = 'backlog', targetSprintId } = data;

  const sprint = await Sprint.findOne({
    _id: id,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);
  if (sprint.status === 'completed') {
    throw new AppError('This sprint has already been completed', 400);
  }

  const tasks = await Task.find({
    sprint: sprint._id,
    workspaceId: user.workspaceId,
  }).populate('assignedUser', 'name email');

  const completedTasks = tasks.filter((t) => t.status === 'done');
  const incompleteTasks = tasks.filter((t) => t.status !== 'done');

  const completedPoints = completedTasks.reduce(
    (sum, t) => sum + (typeof t.storyPoints === 'number' ? t.storyPoints : 0),
    0
  );
  const incompletePoints = incompleteTasks.reduce(
    (sum, t) => sum + (typeof t.storyPoints === 'number' ? t.storyPoints : 0),
    0
  );

  let targetSprint = null;
  if (rolloverAction === 'sprint' && targetSprintId) {
    if (!mongoose.Types.ObjectId.isValid(targetSprintId)) {
      throw new AppError('Invalid target sprint ID format', 400);
    }
    if (targetSprintId.toString() === sprint._id.toString()) {
      throw new AppError(
        'Cannot roll over incomplete tasks into the sprint being completed',
        400
      );
    }
    targetSprint = await Sprint.findOne({
      _id: targetSprintId,
      workspaceId: user.workspaceId,
    });
    if (!targetSprint) {
      throw new AppError('Target rollover sprint not found', 404);
    }
    if (targetSprint.status === 'completed') {
      throw new AppError('Cannot roll over tasks into a completed sprint', 400);
    }
  }

  const completionSnapshot = {
    completedAt: new Date(),
    completedTasksCount: completedTasks.length,
    incompleteTasksCount: incompleteTasks.length,
    committedPoints: sprint.committedPoints || 0,
    completedPoints,
    incompletePoints,
    rolloverAction: targetSprint ? 'sprint' : 'backlog',
    targetSprintId: targetSprint ? targetSprint._id : null,
    targetSprintName: targetSprint ? targetSprint.name : 'Product Backlog',
    completedTasksSummary: completedTasks.map((t) => ({
      id: t._id,
      title: t.title,
      storyPoints: t.storyPoints,
      assignee: t.assignedUser?.name,
    })),
    incompleteTasksSummary: incompleteTasks.map((t) => ({
      id: t._id,
      title: t.title,
      storyPoints: t.storyPoints,
      status: t.status,
      assignee: t.assignedUser?.name,
    })),
  };

  await runInTransaction(async (session) => {
    const sessionOpts = session ? { session } : {};

    if (incompleteTasks.length > 0) {
      const incompleteIds = incompleteTasks.map((t) => t._id);
      await Task.updateMany(
        { _id: { $in: incompleteIds }, workspaceId: user.workspaceId },
        { $set: { sprint: targetSprint ? targetSprint._id : null } },
        sessionOpts
      );
    }

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    sprint.completedPoints = completedPoints;
    sprint.completedTasksCount = completedTasks.length;
    sprint.completionSnapshot = completionSnapshot;

    await sprint.save(sessionOpts);
  });

  await invalidateCache(sprint.workspaceId, 'sprint');

  return {
    sprint,
    summary: {
      completedTasksCount: completedTasks.length,
      incompleteTasksCount: incompleteTasks.length,
      completedPoints,
      incompletePoints,
      rolloverDestination: targetSprint ? targetSprint.name : 'Product Backlog',
    },
  };
};

const getSprintTasks = async (user, sprintId, includeBacklog = false) => {
  const sprint = await Sprint.findOne({
    _id: sprintId,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);

  const tasks = await Task.find({
    sprint: sprint._id,
    workspaceId: user.workspaceId,
  })
    .populate('assignedUser', 'name email role jobTitle profilePicture')
    .populate('project', 'name key lastTaskNumber')
    .populate('dependencies', 'title status taskNumber')
    .sort({ createdAt: -1 });

  let backlogTasks = [];
  if (includeBacklog && sprint.project) {
    backlogTasks = await Task.find({
      project: sprint.project._id || sprint.project,
      sprint: null,
      workspaceId: user.workspaceId,
      status: { $ne: 'done' },
    })
      .populate('assignedUser', 'name email role jobTitle profilePicture')
      .populate('project', 'name key lastTaskNumber')
      .sort({ priority: -1, createdAt: -1 });
  }

  return {
    tasks,
    backlog: backlogTasks,
  };
};

const addTasksToSprint = async (user, sprintId, taskIds = []) => {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    throw new AppError('At least one task ID is required', 400);
  }
  const hasInvalidId = taskIds.some(
    (taskId) => !mongoose.Types.ObjectId.isValid(taskId)
  );
  if (hasInvalidId) {
    throw new AppError('One or more task IDs are invalid', 400);
  }

  const sprint = await Sprint.findOne({
    _id: sprintId,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);
  if (sprint.status === 'completed') {
    throw new AppError('Cannot add tasks to a completed sprint', 400);
  }

  const taskFilter = {
    _id: { $in: taskIds },
    workspaceId: user.workspaceId,
    ...(sprint.project ? { project: sprint.project } : {}),
  };

  const result = await Task.updateMany(taskFilter, {
    $set: { sprint: sprint._id },
  });

  await invalidateCache(sprint.workspaceId, 'sprint');
  return { success: true, count: result.modifiedCount ?? taskIds.length };
};

const removeTaskFromSprint = async (user, sprintId, taskId) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new AppError('Invalid task ID format', 400);
  }

  const sprint = await Sprint.findOne({
    _id: sprintId,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);
  if (sprint.status === 'completed') {
    throw new AppError('Cannot remove tasks from a completed sprint', 400);
  }

  await Task.updateOne(
    { _id: taskId, sprint: sprintId, workspaceId: user.workspaceId },
    { $set: { sprint: null } }
  );

  await invalidateCache(user.workspaceId, 'sprint');
  return { success: true };
};

const getSprintBurndown = async (user, sprintId) => {
  const sprint = await Sprint.findOne({
    _id: sprintId,
    workspaceId: user.workspaceId,
  });
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);

  const tasks = await Task.find({
    sprint: sprint._id,
    workspaceId: user.workspaceId,
  });

  const totalPoints = tasks.reduce(
    (sum, t) => sum + (typeof t.storyPoints === 'number' ? t.storyPoints : 0),
    0
  );
  const totalTasks = tasks.length;
  const initialCommittedPoints = sprint.committedPoints || totalPoints || 0;
  const initialCommittedTasks = sprint.committedTasksCount || totalTasks || 0;

  const start = new Date(sprint.startDate);
  const end = new Date(sprint.endDate);
  const totalDays = Math.max(
    1,
    Math.round((end - start) / (1000 * 60 * 60 * 24))
  );
  const now = new Date();

  const days = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const isPastOrToday = d <= now;

    const idealRemaining = Math.max(
      0,
      Math.round(initialCommittedPoints * (1 - i / totalDays))
    );
    const idealTasksRemaining = Math.max(
      0,
      Math.round(initialCommittedTasks * (1 - i / totalDays))
    );

    let actualRemaining = null;
    let actualTasksRemaining = null;
    let completedPoints = 0;
    let completedTasks = 0;

    if (isPastOrToday) {
      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);

      const doneUpToDate = tasks.filter(
        (t) =>
          t.status === 'done' &&
          t.completedAt &&
          new Date(t.completedAt) <= endOfDay
      );
      completedTasks = doneUpToDate.length;
      completedPoints = doneUpToDate.reduce(
        (sum, t) =>
          sum + (typeof t.storyPoints === 'number' ? t.storyPoints : 0),
        0
      );
      actualRemaining = Math.max(0, totalPoints - completedPoints);
      actualTasksRemaining = Math.max(0, totalTasks - completedTasks);
    }

    days.push({
      day: `Day ${i + 1}`,
      date: dateStr,
      idealRemaining,
      actualRemaining,
      idealTasksRemaining,
      actualTasksRemaining,
      completedPoints,
      completedTasks,
      totalPoints,
      totalTasks,
    });
  }

  return {
    sprint: {
      id: sprint._id,
      name: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      status: sprint.status,
      committedPoints: initialCommittedPoints,
      currentPoints: totalPoints,
      scopeChangePoints: totalPoints - initialCommittedPoints,
    },
    days,
  };
};

const getAiSprintPlanning = async (user, sprintId) => {
  const sprint = await Sprint.findOne({
    _id: sprintId,
    workspaceId: user.workspaceId,
  }).populate('project', 'name key');
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);

  const tasks = await Task.find({
    sprint: sprint._id,
    workspaceId: user.workspaceId,
  }).populate('assignedUser', 'name email role');

  const unestimatedTasks = tasks.filter(
    (t) => t.storyPoints === null || t.storyPoints === undefined
  );
  const unassignedTasks = tasks.filter((t) => !t.assignedUser);
  const blockedTasks = tasks.filter(
    (t) => t.blocked || (t.dependencies && t.dependencies.length > 0)
  );
  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  let backlogTasks = [];
  if (sprint.project) {
    backlogTasks = await Task.find({
      project: sprint.project._id || sprint.project,
      sprint: null,
      workspaceId: user.workspaceId,
      status: { $ne: 'done' },
    }).limit(10);
  }

  const suggestions = [];

  if (unestimatedTasks.length > 0) {
    suggestions.push({
      type: 'estimation',
      severity: 'warning',
      title: `${unestimatedTasks.length} task${unestimatedTasks.length > 1 ? 's' : ''} missing story point estimates`,
      description:
        'Accurate burndown and velocity projections require Fibonacci estimates (1, 2, 3, 5, 8, 13) on all committed items.',
      items: unestimatedTasks
        .slice(0, 5)
        .map((t) => ({ id: t._id, title: t.title })),
    });
  }

  if (unassignedTasks.length > 0) {
    suggestions.push({
      type: 'assignment',
      severity: 'info',
      title: `${unassignedTasks.length} unassigned task${unassignedTasks.length > 1 ? 's' : ''} in sprint`,
      description: 'Assign an owner to each task before starting the sprint.',
      items: unassignedTasks
        .slice(0, 5)
        .map((t) => ({ id: t._id, title: t.title })),
    });
  }

  if (blockedTasks.length > 0) {
    suggestions.push({
      type: 'dependency',
      severity: 'critical',
      title: `${blockedTasks.length} task${blockedTasks.length > 1 ? 's' : ''} have active dependencies or blockers`,
      description:
        'Prioritize resolution of predecessor tasks early in the cycle to avoid downstream idle time.',
      items: blockedTasks.slice(0, 5).map((t) => ({
        id: t._id,
        title: t.title,
        reason: t.blockedReason,
      })),
    });
  }

  let recommendedGoal = sprint.goal || '';
  if (!recommendedGoal) {
    const storiesCount = tasks.filter((t) => t.type === 'story').length;
    const bugsCount = tasks.filter((t) => t.type === 'bug').length;
    if (bugsCount > storiesCount && bugsCount > 0) {
      recommendedGoal = `Stabilize ${sprint.project?.name || 'Project'} platform by addressing ${bugsCount} critical bug fixes and technical debt.`;
    } else if (tasks.length > 0) {
      recommendedGoal = `Deliver core deliverables for ${sprint.project?.name || 'Sprint'}, focusing on ${tasks
        .slice(0, 2)
        .map((t) => t.title)
        .join(' and ')}.`;
    } else {
      recommendedGoal =
        'Complete planned sprint deliverables on schedule with high code quality.';
    }
  }

  return {
    sprintId: sprint._id,
    sprintName: sprint.name,
    totalCommittedTasks: tasks.length,
    totalPoints,
    recommendedGoal,
    suggestions,
    backlogCandidates: backlogTasks.slice(0, 5).map((t) => ({
      id: t._id,
      title: t.title,
      priority: t.priority,
      type: t.type,
      storyPoints: t.storyPoints,
    })),
  };
};

const getAiSprintHealth = async (user, sprintId) => {
  const sprint = await Sprint.findOne({
    _id: sprintId,
    workspaceId: user.workspaceId,
  }).populate('project', 'name key');
  if (!sprint) {
    throw new AppError('Sprint not found', 404);
  }
  await ensureSprintProjectAccess(user, sprint.project);

  const tasks = await Task.find({
    sprint: sprint._id,
    workspaceId: user.workspaceId,
  }).populate('assignedUser', 'name email role');

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const inReview = tasks.filter((t) => t.status === 'in_review').length;
  const blocked = tasks.filter(
    (t) => t.blocked || (t.dependencies && t.dependencies.length > 0)
  ).length;

  const now = new Date();
  const overdue = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
  ).length;

  const totalDays = Math.max(
    1,
    Math.round(
      (new Date(sprint.endDate) - new Date(sprint.startDate)) /
        (1000 * 60 * 60 * 24)
    )
  );
  const elapsedDays = Math.max(
    0,
    Math.round((now - new Date(sprint.startDate)) / (1000 * 60 * 60 * 24))
  );
  const timeProgress = Math.min(
    100,
    Math.round((elapsedDays / totalDays) * 100)
  );
  const completionProgress =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  const drift = completionProgress - timeProgress;
  let statusBadge = 'ON_TRACK';
  let summary = 'Sprint delivery pace is aligned with the planned timeline.';

  if (drift < -25 || blocked > 2 || overdue > 2) {
    statusBadge = 'AT_RISK';
    summary = `Pace is currently lagging (${completionProgress}% completed vs ${timeProgress}% elapsed) with ${blocked} blocked items. Immediate triage recommended.`;
  } else if (drift < -10 || blocked > 0) {
    statusBadge = 'NEEDS_ATTENTION';
    summary = `Minor delivery drift detected. Progress is at ${completionProgress}% while ${timeProgress}% of sprint duration has elapsed.`;
  }

  const workloadMap = {};
  tasks.forEach((t) => {
    if (t.assignedUser) {
      const name = t.assignedUser.name;
      if (!workloadMap[name]) {
        workloadMap[name] = { count: 0, points: 0, active: 0 };
      }
      workloadMap[name].count += 1;
      workloadMap[name].points += t.storyPoints || 0;
      if (t.status !== 'done') workloadMap[name].active += 1;
    }
  });

  const overloadedMembers = Object.entries(workloadMap)
    .filter(([_, stats]) => stats.active >= 5 || stats.points >= 15)
    .map(
      ([name, stats]) =>
        `${name} (${stats.active} open tasks, ${stats.points} pts)`
    );

  const recommendations = [];
  if (overloadedMembers.length > 0) {
    recommendations.push(
      `Workload bottleneck: ${overloadedMembers.join(', ')}. Consider reassigning items to balance capacity.`
    );
  }
  if (blocked > 0) {
    recommendations.push(
      `Unblock ${blocked} flagged tasks to resume flow velocity.`
    );
  }
  if (overdue > 0) {
    recommendations.push(
      `${overdue} tasks have passed their target due date. Review deadlines with assignees.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Team execution is optimal. Continue daily standup checkpoints.'
    );
  }

  return {
    sprintId: sprint._id,
    sprintName: sprint.name,
    healthScore: sprint.healthScore,
    statusBadge,
    completionProgress,
    timeProgress,
    drift,
    remainingDays: Math.max(
      0,
      Math.round((new Date(sprint.endDate) - now) / (1000 * 60 * 60 * 24))
    ),
    summary,
    recommendations,
    metrics: {
      total,
      completed,
      inProgress,
      inReview,
      blocked,
      overdue,
    },
  };
};

module.exports = {
  createSprint,
  getAllSprints,
  getSprint,
  updateSprint,
  deleteSprint,
  syncSprintHealth,
  startSprint,
  completeSprint,
  getSprintTasks,
  addTasksToSprint,
  removeTaskFromSprint,
  getSprintBurndown,
  getAiSprintPlanning,
  getAiSprintHealth,
};
