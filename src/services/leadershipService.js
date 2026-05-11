const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Sprint = require('../models/Sprint');
const AuditLog = require('../models/AuditLog');
const { calculateProgress, formatTimeAgo } = require('../utils/dashboardHelpers');
const Team = require('../models/Team');
const Service = require('../models/Service');

const getTacticalBase = (activity) => {
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
};

const getExecutionStats = async (workspaceId, today) => {
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
};

const getTeamPerformance = async (workspaceId) => {
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
};

const getActivityFeed = async (workspaceId) => {
  const logs = await AuditLog.find({ workspaceId }).sort('-timestamp').limit(8).populate('performer', 'name').lean();
  return logs.map(log => ({
    text: `${log.performer?.name || 'System'} -> ${log.action}`,
    time: formatTimeAgo(log.timestamp)
  }));
};

const getCTOSpecifics = async (workspaceId) => {
  const [atRiskCount, totalBlockers, totalEngineers, sprintTasks, blockedTasks, totalTasks, doneTasks] = await Promise.all([
    Project.countDocuments({ workspaceId, status: 'at_risk' }),
    Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
    User.countDocuments({ workspaceId, role: { $regex: /ENGINEER/i } }),
    Task.aggregate([
      { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } }).limit(5).populate('assignedUser', 'role').lean(),
    Task.countDocuments({ workspaceId }),
    Task.countDocuments({ workspaceId, status: 'done' })
  ]);

  const pipeline = {
    backlog: sprintTasks.find(t => t._id === 'todo')?.count || 0,
    dev: sprintTasks.find(t => t._id === 'in_progress')?.count || 0,
    qa: sprintTasks.find(t => t._id === 'in_review')?.count || 0,
    release: sprintTasks.find(t => t._id === 'done')?.count || 0
  };

  const categorizedBlockers = { engineering: [], qa: [], hr: [] };
  blockedTasks.forEach(task => {
    const role = task.assignedUser?.role || 'ENGINEERING';
    if (role.includes('QA')) categorizedBlockers.qa.push(task.title);
    else if (role.includes('HR')) categorizedBlockers.hr.push(task.title);
    else categorizedBlockers.engineering.push(task.title);
  });

  const avgUtilization = totalEngineers > 0 ? Math.min(95, Math.round(( (totalTasks - doneTasks) / (totalEngineers * 5) ) * 100)) : 0;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return {
    global: {
      projectsAtRisk: atRiskCount,
      totalBlockers: totalBlockers,
      orgDeliveryDrift: atRiskCount > 0 ? atRiskCount * 1.5 : 0,
      avgUtilization, 
      teamsOverloaded: atRiskCount > 2 ? 1 : 0
    },
    functionalBreakdown: {
      engineeringLeadership: { activeProjects: atRiskCount, delayed: atRiskCount, avgDrift: atRiskCount, decisionsPending: 0 },
      engineeringIC: { totalEngineers, avgLoad: avgUtilization, overloaded: avgUtilization > 85 ? 1 : 0, completionRate },
      qa: { activeCycles: atRiskCount > 0 ? 1 : 0, blockedTests: totalBlockers, bugBacklog: 0, avgDelay: 0 },
      hr: { hiringOpen: 0, attritionRisk: 0, avgLoad: 0, burnoutRiskTeams: 0 }
    },
    functionalTable: [
      { function: 'Engineering Leadership', load: atRiskCount > 0 ? 85 : 0, blockers: 0, delay: '0d', status: 'green' },
      { function: 'Engineering ICs', load: avgUtilization, blockers: totalBlockers, delay: atRiskCount > 0 ? `${atRiskCount}d` : '0d', status: atRiskCount > 0 ? 'yellow' : 'green' },
      { function: 'Quality Assurance', load: 0, blockers: 0, delay: '0d', status: 'green' },
      { function: 'HR', load: 0, blockers: 0, delay: '0d', status: 'green' }
    ],
    blockers: categorizedBlockers,
    pipeline
  };
};

const getVPESpecifics = async (workspaceId) => {
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
};

const getTLSpecifics = async (workspaceId) => {
  const [totalTasks, blockedTasks, bugTasks, projects, services] = await Promise.all([
    Task.countDocuments({ workspaceId }),
    Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
    Task.countDocuments({ workspaceId, type: 'bug', status: { $ne: 'done' } }),
    Project.countDocuments({ workspaceId }),
    Service.find({ workspaceId }).populate('owner', 'name').lean()
  ]);

  const activeBlockers = await Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } }).limit(5).lean();

  const healthyServices = services.filter(s => s.status === 'healthy').length;
  const highRiskModules = services.filter(s => (s.technicalDebt?.score || 0) > 70).length;

  const buildLogs = await AuditLog.find({ 
    workspaceId, 
    action: { $regex: /BUILD/i } 
  }).sort('-timestamp').limit(50).lean();

  const successBuilds = buildLogs.filter(l => l.action === 'BUILD_SUCCESS').length;
  const totalBuilds = buildLogs.length;
  const successRate = totalBuilds > 0 ? Math.round((successBuilds / totalBuilds) * 100) : 100;

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 3);

  const codeLogs = await AuditLog.find({
    workspaceId,
    action: { $regex: /COMMIT|PR|MERGE/i },
    timestamp: { $gte: new Date(new Date().setHours(0,0,0,0)) }
  }).lean();

  const stalePRLogs = await AuditLog.aggregate([
    { $match: { 
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        action: 'PR_OPEN',
        timestamp: { $lt: staleThreshold }
    } },
    { $lookup: {
        from: 'auditlogs',
        let: { prId: '$details.prId' },
        pipeline: [
          { $match: { 
              $expr: { $and: [
                { $eq: ['$details.prId', '$$prId'] },
                { $in: ['$action', ['PR_MERGED', 'PR_CLOSED']] }
              ] }
          } }
        ],
        as: 'resolution'
    } },
    { $match: { resolution: { $size: 0 } } }
  ]);

  const bugTrackerRaw = await Task.find({ 
    workspaceId, 
    type: 'bug', 
    status: { $ne: 'done' } 
  }).limit(10).lean();

  return {
    systemHealth: {
      servicesHealthy: services.length > 0 ? `${healthyServices}/${services.length}` : (projects > 0 ? 'All Systems Go' : 'No Active Projects'),
      criticalBlockers: blockedTasks,
      highRiskModules: highRiskModules,
      openBugs: bugTasks,
      buildStability: totalBuilds > 0 ? `${successRate}%` : '100%'
    },
    serviceMap: await Promise.all(services.map(async s => {
      const serviceLogs = await AuditLog.find({
        workspaceId,
        $or: [
          { 'details.serviceId': s._id },
          { action: { $regex: new RegExp(s.name, 'i') } }
        ]
      }).sort('-timestamp').limit(5).lean();

      return {
        id: s._id.toString(),
        name: s.name,
        status: s.status,
        latency: `${s.latency || 0}ms`,
        errorRate: s.errorRate || 0,
        owner: s.owner?.name || 'Platform Team',
        dependencies: s.dependencies?.map(d => d.toString()) || [],
        healthHistory: serviceLogs.map(l => ({
          status: l.action.includes('FAIL') ? 'failing' : (l.action.includes('DEGRADED') ? 'degraded' : 'healthy'),
          time: formatTimeAgo(l.timestamp),
          event: l.action
        }))
      };
    })),
    blockers: activeBlockers.map(t => ({
      id: t._id,
      title: t.title,
      severity: t.priority || 'high',
      impact: 'Deployment Delay',
      since: formatTimeAgo(t.updatedAt)
    })),
    bugTracker: bugTrackerRaw.map(b => ({
      id: b._id,
      issue: b.title,
      severity: b.priority || 'medium',
      module: b.category || 'core',
      status: b.status
    })),
    buildHealth: { 
      lastBuild: buildLogs[0]?.action === 'BUILD_SUCCESS' ? 'SUCCESS' : (buildLogs[0]?.action === 'BUILD_FAILED' ? 'FAILING' : 'NONE'), 
      successRate: `${successRate}%`, 
      deployFrequency: totalBuilds > 0 ? `${(totalBuilds / 7).toFixed(1)}/D` : '0/D', 
      rollbackCount: buildLogs.filter(l => l.action === 'ROLLBACK').length 
    },
    codeActivity: { 
      commitsToday: codeLogs.filter(l => l.action.includes('COMMIT')).length, 
      prsOpen: codeLogs.filter(l => l.action.includes('PR_OPEN')).length, 
      prsMerged: codeLogs.filter(l => l.action.includes('PR_MERGED')).length, 
      stalePRs: stalePRLogs.length
    },
    technicalDebt: services
      .filter(s => (s.technicalDebt?.score || 0) > 30)
      .map(s => ({
        module: s.name,
        reason: s.technicalDebt?.notes || 'Refactor Required',
        debtLevel: (s.technicalDebt?.score || 0) > 70 ? 'High' : 'Medium'
      }))
  };
};

const getEMSpecifics = async (workspaceId, userId) => {
  // 1. RBAC Scope: Find team managed by this user
  const managedTeam = await Team.findOne({ workspaceId, lead: userId }).lean();
  const teamMemberIds = managedTeam ? managedTeam.members : null;

  const userQuery = { workspaceId };
  if (teamMemberIds) {
    userQuery._id = { $in: teamMemberIds };
  }

  const taskQuery = { workspaceId, status: { $ne: 'done' } };
  if (teamMemberIds) {
    taskQuery.assignedUser = { $in: teamMemberIds };
  }

  const [users, tasks, activeSprint] = await Promise.all([
    User.find(userQuery).limit(20).lean(),
    Task.find(taskQuery).sort('-priority -dueDate').limit(50).populate('assignedUser', 'name').lean(),
    Sprint.findOne({ workspaceId, status: 'active' }).lean()
  ]);

  const AVAILABLE_HOURS_WEEK = 40;
  const AVAILABLE_MINUTES_WEEK = AVAILABLE_HOURS_WEEK * 60;

  const teamWorkload = users.map(user => {
    const userTasks = tasks.filter(t => t.assignedUser?._id.toString() === user._id.toString());
    
    // V1: Legacy load calculation (tasks * 20)
    const load = Math.min(100, (userTasks.length * 20));
    
    // V2: Accurate load calculation (estimatedDuration / capacity)
    // estimatedDuration is in minutes by default
    const totalMinutes = userTasks.reduce((acc, t) => acc + (t.estimatedDuration || 30), 0);
    const loadV2 = Math.round(Math.min(100, (totalMinutes / AVAILABLE_MINUTES_WEEK) * 100));

    return {
      id: user._id,
      member: user.name,
      tasks: userTasks.length,
      load,
      loadV2,
      status: loadV2 > 90 ? 'red' : loadV2 > 70 ? 'yellow' : 'green'
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
      backend: tasks.filter(t => 
        t.category === 'backend' || 
        t.title.toLowerCase().includes('api') || 
        t.title.toLowerCase().includes('db') || 
        t.title.toLowerCase().includes('server')
      ).length,
      frontend: tasks.filter(t => 
        t.category === 'frontend' || 
        t.title.toLowerCase().includes('ui') || 
        t.title.toLowerCase().includes('design') || 
        t.title.toLowerCase().includes('css')
      ).length,
      qa: tasks.filter(t => 
        t.category === 'qa' || 
        t.title.toLowerCase().includes('test') || 
        t.title.toLowerCase().includes('bug') || 
        t.title.toLowerCase().includes('verify')
      ).length,
      other: tasks.length - (
        tasks.filter(t => t.category === 'backend' || t.title.toLowerCase().includes('api') || t.title.toLowerCase().includes('db') || t.title.toLowerCase().includes('server')).length +
        tasks.filter(t => t.category === 'frontend' || t.title.toLowerCase().includes('ui') || t.title.toLowerCase().includes('design') || t.title.toLowerCase().includes('css')).length +
        tasks.filter(t => t.category === 'qa' || t.title.toLowerCase().includes('test') || t.title.toLowerCase().includes('bug') || t.title.toLowerCase().includes('verify')).length
      ),
      imbalance: blockers.length > 3 ? 'Heavy focus on Backend causing QA starvation' : null
    },
    focusToday: taskBoard.filter(t => t.due === 'Today' || t.priority === 'urgent').map(t => t.title).slice(0, 3)
  };
};

const getRoleSpecificData = async (workspaceId, role, userId) => {
  const r = (role || '').toUpperCase().replace(' ', '_');

  if (['CTO', 'WORKSPACE_ADMIN'].includes(r)) {
    return await getCTOSpecifics(workspaceId);
  }
  
  if (['VPE', 'VP_ENGINEERING'].includes(r)) {
    return await getVPESpecifics(workspaceId);
  }
  
  if (['TL', 'TECH_LEAD'].includes(r)) {
    return await getTLSpecifics(workspaceId);
  }
  
  if (['EM', 'ENGINEERING_MANAGER'].includes(r)) {
    return await getEMSpecifics(workspaceId, userId);
  }

  return {};
};

const getLeadershipDashboard = async (userId, workspaceId, role) => {
  const today = new Date();
  
  const [executionStats, teamGrid, activity] = await Promise.all([
    getExecutionStats(workspaceId, today),
    getTeamPerformance(workspaceId),
    getActivityFeed(workspaceId)
  ]);

  const roleSpecificData = await getRoleSpecificData(workspaceId, role, userId);

  return {
    ...getTacticalBase(activity),
    executionStats,
    teamGrid,
    ...roleSpecificData
  };
};

const getRoleBreakdown = async (workspaceId, category) => {
  const rolesMap = {
    leadership: ['WORKSPACE_ADMIN', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD'],
    engineering: ['SENIOR_ENGINEER', 'SOFTWARE_ENGINEER', 'INTERN'],
    qa: ['QA_LEAD', 'QA', 'SQA'], 
    people: ['HR']
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
};

const getIndividualBreakdown = async (workspaceId, role) => {
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
};

const getProjectWarRoomData = async (workspaceId, projectId) => {
  const [project, activeSprint, tasks, directives] = await Promise.all([
    Project.findById(projectId).populate('members', 'name role avatar').lean(),
    Sprint.findOne({ workspaceId, status: 'active' }).lean(),
    Task.find({ projectId }).populate('assignedUser', 'name role').lean(),
    require('../models/Directive').find({ workspaceId, status: 'issued' }).sort('-priority').limit(3).lean()
  ]);

  if (!project) return null;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const blockedTasks = tasks.filter(t => t.blocked && t.status !== 'done');
  const criticalTasks = tasks.filter(t => (t.priority === 'urgent' || t.priority === 'high') && t.status !== 'done');
  
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Calculate Drift
  const overdueCount = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done').length;
  const health = overdueCount > 5 || blockedTasks.length > 3 ? 'AT_RISK' : (overdueCount > 0 ? 'NEEDS_ATTENTION' : 'ON_TRACK');

  return {
    project: {
      name: project.name,
      key: project.key,
      health,
      progress,
      membersCount: project.members.length
    },
    sprint: activeSprint ? {
      name: activeSprint.name,
      daysLeft: Math.max(0, Math.ceil((new Date(activeSprint.endDate) - new Date()) / (1000 * 60 * 60 * 24)))
    } : null,
    metrics: {
      total: totalTasks,
      completed: completedTasks,
      blocked: blockedTasks.length,
      critical: criticalTasks.length,
      drift: overdueCount > 0 ? `+${overdueCount}d` : '0d'
    },
    blockers: blockedTasks.map(t => ({
      id: t._id,
      title: t.title,
      owner: t.assignedUser?.name || 'Unassigned',
      reason: t.blockedReason || 'Unknown'
    })),
    directives: directives.map(d => ({
      id: d._id,
      title: d.title,
      type: d.type,
      priority: d.priority
    })),
    criticalPath: criticalTasks.slice(0, 5).map(t => ({
      id: t._id,
      title: t.title,
      status: t.status,
      owner: t.assignedUser?.name || 'Unassigned'
    })),
    reviewQueue: tasks.filter(t => t.status === 'in_review').map(t => ({
      id: t._id,
      title: t.title,
      owner: t.assignedUser?.name || 'Unassigned',
      reviewers: t.reviewers
    })),
    burnoutRisks: project.members.map(m => {
       const userTasks = tasks.filter(t => t.assignedUser?._id.toString() === m._id.toString());
       const load = Math.min(100, userTasks.length * 20); // Simplified load for now
       return { name: m.name, load, role: m.role };
    }).filter(m => m.load >= 80),
    eventFeed: await AuditLog.find({ 'details.projectId': projectId }).sort('-timestamp').limit(10).populate('performer', 'name').lean()
      .then(logs => logs.map(l => ({
        text: `${l.performer?.name || 'System'} -> ${l.action}`,
        time: formatTimeAgo(l.timestamp)
      })))
  };
};

module.exports = {
  getLeadershipDashboard,
  getRoleBreakdown,
  getIndividualBreakdown,
  getProjectWarRoomData,
};
