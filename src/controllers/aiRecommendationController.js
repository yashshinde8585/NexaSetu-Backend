const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const portfolioAgent = require('../services/portfolioAgent');

/**
 * Controller for rule-based AI recommendations
 */

exports.getPortfolioRecommendations = async (req, res) => {
  try {
    // 1. Fetch all projects and tasks the user has access to
    const projects = await Project.find({ members: req.user.id });
    const projectIds = projects.map(p => p._id);
    
    const tasks = await Task.find({ 
      project: { $in: projectIds },
      status: { $ne: 'done' } // Only care about incomplete tasks for recommendations
    }).populate('assignedUser', 'name').populate('project', 'name');

    // 2. Resource Data (Workload)
    const teamMemberIds = [...new Set(projects.flatMap(p => p.members))];
    const userTaskCounts = {};
    teamMemberIds.forEach(id => userTaskCounts[id.toString()] = 0);
    
    tasks.forEach(task => {
      if (task.assignedUser) {
        const uid = task.assignedUser._id.toString();
        userTaskCounts[uid] = (userTaskCounts[uid] || 0) + 1;
      }
    });

    const recommendations = [];
    const now = new Date();

    // --- RULE ENGINE ---

    // Rule 1: Task Delay Detection (Individual Tasks)
    tasks.forEach(task => {
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        if (now > dueDate) {
          recommendations.push({
            type: 'delay',
            priority: 'high',
            message: `Task "${task.title}" is delayed in project ${task.project.name}.`,
            action: 'Extend deadline or reassign to accelerate.',
            targetId: task._id,
            targetType: 'task'
          });
        } else if ((dueDate - now) / (1000 * 60 * 60) < 24) {
          recommendations.push({
            type: 'delay',
            priority: 'medium',
            message: `Task "${task.title}" is at risk of delay (due in < 24h).`,
            action: 'Assign additional resource or increase priority.',
            targetId: task._id,
            targetType: 'task'
          });
        }
      }
    });

    // Rule 2: Resource Overload (User Workload)
    const overloadedUserIds = Object.keys(userTaskCounts).filter(uid => userTaskCounts[uid] >= 6);
    const availableUserIds = Object.keys(userTaskCounts).filter(uid => userTaskCounts[uid] <= 2);

    if (overloadedUserIds.length > 0) {
        const users = await User.find({ _id: { $in: overloadedUserIds } }, 'name');
        users.forEach(user => {
            recommendations.push({
                type: 'resource',
                priority: 'high',
                message: `${user.name} is currently overloaded with ${userTaskCounts[user._id.toString()]} active tasks.`,
                action: availableUserIds.length > 0 ? 'Redistribute tasks to underutilized team members.' : 'Consider extending project timelines or pausing new tasks.',
                targetId: user._id,
                targetType: 'user'
            });
        });
    }

    // Rule 3: Workload Balancing (Specific Redistribution Suggestion)
    if (overloadedUserIds.length > 0 && availableUserIds.length > 0) {
        recommendations.push({
            type: 'workload',
            priority: 'medium',
            message: 'Significant workload imbalance detected across your team.',
            action: 'Rebalance tasks from overloaded members to available resources.',
            targetType: 'portfolio'
        });
    }

    // Rule 4: Unassigned Manual Tasks
    const unassignedTasks = tasks.filter(t => !t.assignedUser && t.source === 'manual');
    if (unassignedTasks.length >= 3) {
        recommendations.push({
            type: 'efficiency',
            priority: 'low',
            message: `You have ${unassignedTasks.length} unassigned manual tasks pending.`,
            action: 'Assign these tasks to team members to start execution.',
            targetType: 'portfolio'
        });
    }

    // --- PORTFOLIO AGENT AUDIT ---
    // (We simulate the resources data similar to what's in the controller)
    const mockResources = Object.keys(userTaskCounts).map(uid => ({
        _id: uid,
        activeTasksCount: userTaskCounts[uid],
        workloadStatus: userTaskCounts[uid] >= 6 ? 'Overloaded' : (userTaskCounts[uid] >= 4 ? 'Warning' : 'Normal')
    }));

    const auditRes = await portfolioAgent.performAudit(projects, mockResources);
    recommendations.push(...auditRes.globalRecommendations);

    res.status(200).json({
      status: 'success',
      results: recommendations.length,
      data: { 
        recommendations: recommendations.sort((a, b) => {
            const p = { high: 3, medium: 2, low: 1 };
            return p[b.priority] - p[a.priority];
        })
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to generate recommendations' });
  }
};
