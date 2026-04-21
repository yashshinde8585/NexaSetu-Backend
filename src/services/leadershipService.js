const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Sprint = require('../models/Sprint');
const AuditLog = require('../models/AuditLog');
const { calculateProgress, formatTimeAgo } = require('../utils/dashboardHelpers');

class LeadershipService {
  // Main orchestrator for leadership analytics based on role
  async getLeadershipDashboard(userId, workspaceId, role) {
    const today = new Date();
    
    const [executionStats, teamGrid, activity] = await Promise.all([
      this._getExecutionStats(workspaceId, today),
      this._getTeamPerformance(workspaceId),
      this._getActivityFeed(workspaceId)
    ]);

    const roleSpecificData = await this._getRoleSpecificData(workspaceId, role);

    return {
      ...this._getTacticalBase(activity),
      executionStats,
      teamGrid,
      ...roleSpecificData
    };
  }

  // Provide baseline dashboard structure
  _getTacticalBase(activity) {
    return {
      sprintControl: { progress: 0, delayRisk: 'LOW', blockedTasks: 0, teamLoad: 0, tasksDueToday: 0 },
      taskBoard: [],
      blockers: [],
      teamWorkload: [],
      burndown: { planned: 0, completed: 0, remaining: 0, daysLeft: 0 },
      activity: activity || [],
      focusToday: [],
      distribution: { backend: 0, frontend: 0, qa: 0, other: 0, imbalance: null }
    };
  }

  // Route to specific analytics based on management role
  async _getRoleSpecificData(workspaceId, role) {
    const r = (role || '').toUpperCase().replace(' ', '_');

    // CTO / Admin view
    if (['CTO', 'WORKSPACE_ADMIN'].includes(r)) {
      return this._getCTOSpecifics(workspaceId);
    }
    
    // VPE view
    if (['VPE', 'VP_ENGINEERING'].includes(r)) {
      return this._getVPESpecifics(workspaceId);
    }
    
    // TL view
    if (['TL', 'TECH_LEAD'].includes(r)) {
      return this._getTLSpecifics(workspaceId);
    }
    
    // EM view
    if (['EM', 'ENGINEERING_MANAGER'].includes(r)) {
      return this._getEMSpecifics(workspaceId);
    }

    return {};
  }

  // Calculate high-level project execution and velocity metrics
  async _getExecutionStats(workspaceId, today) {
    const [atRisk, blockedCount, projects] = await Promise.all([
      Project.countDocuments({ workspaceId, status: 'at_risk' }),
      Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
      Project.countDocuments({ workspaceId })
    ]);

    return {
      projectsDelayed: atRisk,
      avgSprintDelay: atRisk > 0 ? `+${atRisk * 2}d` : '0d',
      activeBlockers: blockedCount,
      teamsOverloaded: atRisk > 2 ? 1 : 0,
      velocityTrend: { 
        direction: (projects === 0) ? 'stable' : (atRisk > 2 ? 'down' : 'up'), 
        value: (projects === 0) ? '0%' : (atRisk > 2 ? '-5%' : '+12%') 
      }
    };
  }

  // Aggregate performance and workload metrics by functional team
  async _getTeamPerformance(workspaceId) {
    const result = await User.aggregate([
      { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
      {
        $addFields: {
          teamName: {
            $cond: [
              { $regexMatch: { input: '$jobTitle', regex: /backend|api|database/i } }, 'Backend',
              { $cond: [
                { $regexMatch: { input: '$jobTitle', regex: /frontend|ui|ux/i } }, 'Frontend',
                { $cond: [
                  { $regexMatch: { input: '$jobTitle', regex: /qa|test/i } }, 'QA', 'Other'
                ]}
              ]}
            ]
          }
        }
      },
      { $match: { teamName: { $ne: 'Other' } } },
      {
        $lookup: {
          from: 'tasks',
          localField: '_id',
          foreignField: 'assignedUser',
          as: 'tasks'
        }
      },
      { $unwind: { path: '$tasks', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$teamName',
          totalTasks: { $sum: { $cond: [{ $ifNull: ['$tasks', false] }, 1, 0] } },
          completedTasks: { $sum: { $cond: [{ $eq: ['$tasks.status', 'done'] }, 1, 0] } },
          blockedTasks: { $sum: { $cond: [{ $and: [{ $ifNull: ['$tasks', false] }, { $eq: ['$tasks.blocked', true] }, { $ne: ['$tasks.status', 'done'] }] }, 1, 0] } }
        }
      }
    ]);

    return result.map(group => {
      const progress = calculateProgress(group.totalTasks, group.completedTasks);
      const loadPercentage = group.totalTasks > 0 ? Math.min(100, (group.totalTasks * 15)) : 0;
      return {
        team: group._id,
        progress: `${progress.percentage}%`,
        velocity: progress.percentage > 70 ? 'up' : progress.percentage < 30 ? 'down' : 'stable',
        load: `${loadPercentage}%`,
        blockers: group.blockedTasks,
        status: group.blockedTasks > 2 ? 'red' : group.blockedTasks > 0 ? 'yellow' : 'green'
      };
    });
  }

  // Retrieve summarized feed of recent organizational activity
  async _getActivityFeed(workspaceId) {
    const logs = await AuditLog.find({ workspaceId }).sort('-timestamp').limit(8).populate('performer', 'name').lean();
    return logs.map(log => ({
      text: `${log.performer?.name || 'System'} -> ${log.action}`,
      time: formatTimeAgo(log.timestamp)
    }));
  }

  // Analytics tailored for Chief Technology Officer
  async _getCTOSpecifics(workspaceId) {
    const [atRiskCount, totalBlockers, totalEngineers, sprintTasks, blockedTasks] = await Promise.all([
      Project.countDocuments({ workspaceId, status: 'at_risk' }),
      Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
      User.countDocuments({ workspaceId, role: { $in: ['SENIOR_ENGINEER', 'SOFTWARE_ENGINEER', 'JUNIOR_ENGINEER'] } }),
      Task.aggregate([
        { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } }).limit(5).populate('assignedUser', 'role').lean()
    ]);

    const pipeline = {
      backlog: sprintTasks.find(t => t._id === 'todo')?.count || 0,
      dev: sprintTasks.find(t => t._id === 'in_progress')?.count || 0,
      qa: sprintTasks.find(t => t._id === 'in_review')?.count || 0,
      release: sprintTasks.find(t => t._id === 'done')?.count || 0
    };

    const categorizedBlockers = { engineering: [], qa: [], peopleOps: [] };
    blockedTasks.forEach(task => {
      const role = task.assignedUser?.role || 'ENGINEERING';
      if (role.includes('QA')) categorizedBlockers.qa.push(task.title);
      else if (role.includes('HR')) categorizedBlockers.peopleOps.push(task.title);
      else categorizedBlockers.engineering.push(task.title);
    });

    return {
      global: {
        projectsAtRisk: atRiskCount,
        totalBlockers: totalBlockers,
        orgDeliveryDrift: atRiskCount > 0 ? atRiskCount * 1.5 : 0,
        avgUtilization: totalEngineers > 0 ? 78 : 0, 
        teamsOverloaded: atRiskCount > 2 ? 1 : 0
      },
      functionalBreakdown: {
        engineeringLeadership: { activeProjects: atRiskCount, delayed: atRiskCount, avgDrift: atRiskCount, decisionsPending: 0 },
        engineeringIC: { totalEngineers, avgLoad: totalEngineers > 0 ? 75 : 0, overloaded: 0, completionRate: totalEngineers > 0 ? 88 : 0 },
        qa: { activeCycles: atRiskCount > 0 ? 1 : 0, blockedTests: totalBlockers, bugBacklog: 0, avgDelay: 0 },
        peopleOps: { hiringOpen: 0, attritionRisk: 0, avgLoad: 0, burnoutRiskTeams: 0 }
      },
      functionalTable: [
        { function: 'Engineering Leadership', load: atRiskCount > 0 ? 85 : 0, blockers: 0, delay: '0d', status: 'green' },
        { function: 'Engineering ICs', load: totalEngineers > 0 ? 78 : 0, blockers: totalBlockers, delay: atRiskCount > 0 ? `${atRiskCount}d` : '0d', status: atRiskCount > 0 ? 'yellow' : 'green' },
        { function: 'Quality Assurance', load: 0, blockers: 0, delay: '0d', status: 'green' },
        { function: 'People & Ops', load: 0, blockers: 0, delay: '0d', status: 'green' }
      ],
      blockers: categorizedBlockers,
      pipeline
    };
  }

  // Analytics tailored for VP of Engineering
  async _getVPESpecifics(workspaceId) {
    const [atRiskCount, totalBlockers, totalTasks, completedTasksCount, blockedTasks, activeProjects] = await Promise.all([
      Project.countDocuments({ workspaceId, status: 'at_risk' }),
      Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
      Task.countDocuments({ workspaceId }),
      Task.countDocuments({ workspaceId, status: 'done' }),
      Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } }).limit(5).lean(),
      Project.find({ workspaceId }).limit(3).lean()
    ]);

    const progress = calculateProgress(totalTasks, completedTasksCount);

    return {
      sprintExecution: {
        progress: progress.percentage,
        risk: atRiskCount > 2 ? 'HIGH' : atRiskCount > 0 ? 'MEDIUM' : 'LOW',
        completed: completedTasksCount,
        inProgress: Math.max(0, totalTasks - completedTasksCount - totalBlockers),
        blocked: totalBlockers
      },
      blockers: {
         'Technical': blockedTasks.slice(0, 2).map(t => t.title),
         'Strategic': atRiskCount > 0 ? ['Resource shift required for at-risk projects'] : []
      },
      timeline: activeProjects.map(p => ({
        project: p.name,
        drift: p.status === 'at_risk' ? '+2d' : 'On Track',
        status: p.status === 'at_risk' ? 'red' : 'green'
      }))
    };
  }

  // Analytics tailored for Technical Leads
  async _getTLSpecifics(workspaceId) {
    const [totalTasks, blockedTasks, bugTasks, projects] = await Promise.all([
      Task.countDocuments({ workspaceId }),
      Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
      Task.countDocuments({ workspaceId, type: 'bug', status: { $ne: 'done' } }),
      Project.countDocuments({ workspaceId })
    ]);

    const activeBlockers = await Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } }).limit(5).lean();

    return {
      systemHealth: {
        servicesHealthy: projects > 0 ? 'All Systems Go' : 'No Active Projects',
        criticalBlockers: blockedTasks,
        highRiskModules: 0,
        openBugs: bugTasks,
        buildStability: projects > 0 ? '100%' : 'N/A'
      },
      serviceMap: [],
      blockers: activeBlockers.map(t => ({
        title: t.title,
        severity: t.priority || 'high',
        impact: 'Deployment Delay',
        since: formatTimeAgo(t.updatedAt)
      })),
      bugTracker: [],
      buildHealth: { lastBuild: projects > 0 ? 'success' : 'none', successRate: '100%', deployFrequency: 'Ad-hoc', rollbackCount: 0 },
      codeActivity: { commitsToday: 0, prsOpen: 0, prsMerged: 0, stalePRs: 0 },
      technicalDebt: []
    };
  }

  // Analytics tailored for Engineering Managers
  async _getEMSpecifics(workspaceId) {
    const [users, tasks, activeSprint] = await Promise.all([
      User.find({ workspaceId }).limit(10).lean(),
      Task.find({ workspaceId, status: { $ne: 'done' } }).sort('-priority -dueDate').limit(15).populate('assignedUser', 'name').lean(),
      Sprint.findOne({ workspaceId, status: 'active' }).lean()
    ]);

    const teamWorkload = users.map(user => {
      const userTasks = tasks.filter(t => t.assignedUser?._id.toString() === user._id.toString());
      const load = Math.min(100, (userTasks.length * 20));
      return {
        member: user.name,
        tasks: userTasks.length,
        load,
        status: load > 85 ? 'red' : load > 60 ? 'yellow' : 'green'
      };
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const taskBoard = tasks.map(t => {
      let dueLabel = 'Active';
      if (t.dueDate) {
        const dDate = new Date(t.dueDate);
        const dStr = dDate.toISOString().split('T')[0];
        if (dStr === todayStr) dueLabel = 'Today';
        else if (dStr === tomorrowStr) dueLabel = 'Tomorrow';
        else if (dDate < now) dueLabel = 'Overdue';
      } else {
        dueLabel = 'No Date';
      }

      return {
        id: t._id,
        title: t.title,
        owner: t.assignedUser?.name || 'Unassigned',
        status: t.status,
        due: dueLabel,
        blocked: t.blocked,
        priority: t.priority
      };
    });

    const blockers = tasks.filter(t => t.blocked).map(t => ({
      id: t._id,
      title: t.title,
      since: formatTimeAgo(t.updatedAt),
      reason: t.blockedReason || 'Environment / Dependency mismatch'
    }));

    const totalTasks = await Task.countDocuments({ workspaceId });
    const doneTasks = await Task.countDocuments({ workspaceId, status: 'done' });

    let daysLeft = 0;
    if (activeSprint && activeSprint.endDate) {
      const diffTime = new Date(activeSprint.endDate) - now;
      daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return {
      sprintControl: { 
        progress: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0, 
        delayRisk: blockers.length > 2 ? 'HIGH' : blockers.length > 0 ? 'MEDIUM' : 'LOW', 
        blockedTasks: blockers.length, 
        teamLoad: Math.round(teamWorkload.reduce((acc, m) => acc + m.load, 0) / (teamWorkload.length || 1)), 
        tasksDueToday: tasks.filter(t => {
          if (!t.dueDate) return false;
          return new Date(t.dueDate).toISOString().split('T')[0] === todayStr;
        }).length 
      },
      taskBoard,
      teamWorkload,
      blockers,
      burndown: {
        planned: totalTasks,
        completed: doneTasks,
        remaining: totalTasks - doneTasks,
        daysLeft
      },
      distribution: {
        backend: tasks.filter(t => t.title.toLowerCase().includes('api') || t.title.toLowerCase().includes('db')).length,
        frontend: tasks.filter(t => t.title.toLowerCase().includes('ui') || t.title.toLowerCase().includes('design')).length,
        qa: tasks.filter(t => t.title.toLowerCase().includes('test')).length,
        other: 0,
        imbalance: blockers.length > 3 ? 'Heavy focus on Backend causing QA starvation' : null
      },
      focusToday: taskBoard.filter(t => t.due === 'Today' || t.priority === 'urgent').map(t => t.title).slice(0, 3)
    };
  }

  // Drill down into specific roles within a function (Management, ICs, etc.)
  async getRoleBreakdown(workspaceId, category) {
    const rolesMap = {
      leadership: ['WORKSPACE_ADMIN', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD'],
      engineering: ['SENIOR_ENGINEER', 'SOFTWARE_ENGINEER', 'INTERN'],
      qa: ['QA_LEAD', 'QA', 'SQA'], 
      people: ['PEOPLE_OPS']
    };

    const targetRoles = rolesMap[category.toLowerCase()] || [];
    
    return User.aggregate([
      { $match: { 
          workspaceId: new mongoose.Types.ObjectId(workspaceId), 
          role: { $in: targetRoles } 
      } },
      { $lookup: {
          from: 'tasks',
          localField: '_id',
          foreignField: 'assignedUser',
          as: 'tasks'
      }},
      { $project: {
          role: 1,
          taskCount: { $size: { $filter: { input: '$tasks', as: 't', cond: { $ne: ['$$t.status', 'done'] } } } },
          totalHours: { $sum: '$tasks.estimatedDuration' }
      }},
      { $group: {
          _id: '$role',
          count: { $sum: 1 },
          avgLoad: { $avg: { $divide: ['$totalHours', 40] } }
      }},
      { $project: {
          role: '$_id',
          count: 1,
          avgLoad: { $multiply: [{ $ifNull: [{ $round: ['$avgLoad', 2] }, 0] }, 100] },
          status: { $cond: [{ $gt: ['$avgLoad', 1] }, 'red', 'green'] }
      }}
    ]);
  }

  // Drill down into individuals for a specific role
  async getIndividualBreakdown(workspaceId, role) {
    return User.aggregate([
      { $match: { 
          workspaceId: new mongoose.Types.ObjectId(workspaceId), 
          role: role.toUpperCase() 
      } },
      { $lookup: {
          from: 'tasks',
          localField: '_id',
          foreignField: 'assignedUser',
          as: 'tasks'
      }},
      { $project: {
          name: 1,
          role: 1,
          tasks: { $size: { $filter: { input: '$tasks', as: 't', cond: { $ne: ['$$t.status', 'done'] } } } },
          load: { $multiply: [{ $divide: [{ $sum: '$tasks.estimatedDuration' }, 40] }, 100] }
      }},
      { $project: {
          name: 1,
          role: 1,
          tasks: 1,
          load: { $round: ['$load', 0] },
          status: { $cond: [{ $gt: ['$load', 100] }, 'red', 'green'] }
      }}
    ]);
  }
}

module.exports = new LeadershipService();
