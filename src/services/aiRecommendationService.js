const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const portfolioAgent = require('./portfolioAgent');
const { getProjectAccessQuery } = require('../utils/queryHelpers');

const getPortfolioRecommendations = async (user) => {
  const projects = await Project.find(getProjectAccessQuery(user));
  const projectIds = projects.map((p) => p._id);

  const tasks = await Task.find({
    project: { $in: projectIds },
    status: { $ne: 'done' },
  })
    .populate('assignedUser', 'name')
    .populate('project', 'name');

  // Aggregate active personnel and establish baseline workload metrics.
  const teamMemberIds = [...new Set(projects.flatMap((p) => p.members))];
  const userTaskCounts = {};
  teamMemberIds.forEach((id) => (userTaskCounts[id.toString()] = 0));

  tasks.forEach((task) => {
    if (task.assignedUser) {
      const uid = task.assignedUser._id.toString();
      userTaskCounts[uid] = (userTaskCounts[uid] || 0) + 1;
    }
  });

  const recommendations = [];
  const now = new Date();

  // Evaluate delivery risks based on unfulfilled task deadlines.
  tasks.forEach((task) => {
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      if (now > dueDate) {
        recommendations.push({
          type: 'delay',
          priority: 'high',
          message: `Task "${task.title}" is delayed in project ${task.project?.name || 'Unknown Project'}.`,
          action: 'Extend deadline or reassign to accelerate.',
          targetId: task._id,
          targetType: 'task',
        });
      } else if ((dueDate - now) / (1000 * 60 * 60) < 24) {
        recommendations.push({
          type: 'delay',
          priority: 'medium',
          message: `Task "${task.title}" is at risk of delay (due in < 24h).`,
          action: 'Assign additional resource or increase priority.',
          targetId: task._id,
          targetType: 'task',
        });
      }
    }
  });

  // Identify critical capacity issues within the team matrix.
  const overloadedUserIds = Object.keys(userTaskCounts).filter(
    (uid) => userTaskCounts[uid] >= 6
  );
  const availableUserIds = Object.keys(userTaskCounts).filter(
    (uid) => userTaskCounts[uid] <= 2
  );

  if (overloadedUserIds.length > 0) {
    const users = await User.find({ _id: { $in: overloadedUserIds } }, 'name');
    users.forEach((u) => {
      recommendations.push({
        type: 'resource',
        priority: 'high',
        message: `${u.name} is currently overloaded with ${userTaskCounts[u._id.toString()]} active tasks.`,
        action:
          availableUserIds.length > 0
            ? 'Redistribute tasks to underutilized team members.'
            : 'Consider extending project timelines or pausing new tasks.',
        targetId: u._id,
        targetType: 'user',
      });
    });
  }

  if (overloadedUserIds.length > 0 && availableUserIds.length > 0) {
    recommendations.push({
      type: 'workload',
      priority: 'medium',
      message: 'Significant workload imbalance detected across your team.',
      action: 'Rebalance tasks from overloaded members to available resources.',
      targetType: 'portfolio',
    });
  }

  // Detect operational bottlenecks stemming from neglected manual task items.
  const unassignedTasks = tasks.filter(
    (t) => !t.assignedUser && t.source === 'manual'
  );
  if (unassignedTasks.length >= 3) {
    recommendations.push({
      type: 'efficiency',
      priority: 'low',
      message: `You have ${unassignedTasks.length} unassigned manual tasks pending.`,
      action: 'Assign these tasks to team members to start execution.',
      targetType: 'portfolio',
    });
  }
  const liveResourceData = Object.keys(userTaskCounts).map((uid) => ({
    _id: uid,
    activeTasksCount: userTaskCounts[uid],
    workloadStatus:
      userTaskCounts[uid] >= 6
        ? 'Overloaded'
        : userTaskCounts[uid] >= 4
          ? 'Warning'
          : 'Normal',
  }));

  const auditRes = await portfolioAgent.performAudit(
    projects,
    liveResourceData
  );
  recommendations.push(...auditRes.globalRecommendations);

  return recommendations.sort((a, b) => {
    const p = { high: 3, medium: 2, low: 1 };
    return p[b.priority] - p[a.priority];
  });
};

module.exports = {
  getPortfolioRecommendations,
};
