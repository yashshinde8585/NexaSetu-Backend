const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Sprint = require('../models/Sprint');
const AuditLog = require('../models/AuditLog');
const {
  calculateProgress,
  formatTimeAgo,
} = require('../utils/dashboardHelpers');
const Team = require('../models/Team');
const Service = require('../models/Service');
const TestCase = require('../models/TestCase');

const getTacticalBase = (activity) => {
  return {
    sprintControl: {
      progress: 0,
      delayRisk: 'LOW',
      blockedTasks: 0,
      teamLoad: 0,
      tasksDueToday: 0,
    },
    taskBoard: [],
    blockers: [],
    teamWorkload: [],
    burndown: { planned: 0, completed: 0, remaining: 0, daysLeft: 0 },
    activity: activity || [],
    focusToday: [],
    distribution: { backend: 0, frontend: 0, qa: 0, other: 0, imbalance: null },
  };
};

const getExecutionStats = async (workspaceId, today) => {
  const [atRisk, blockedCount, projects] = await Promise.all([
    Project.countDocuments({ workspaceId, status: 'at_risk' }),
    Task.countDocuments({
      workspaceId,
      blocked: true,
      status: { $ne: 'done' },
    }),
    Project.countDocuments({ workspaceId }),
  ]);

  return {
    projectsDelayed: atRisk,
    avgSprintDelay: atRisk > 0 ? `+${atRisk * 2}d` : '0d',
    activeBlockers: blockedCount,
    teamsOverloaded: atRisk > 2 ? 1 : 0,
    velocityTrend: {
      direction: projects === 0 ? 'stable' : atRisk > 2 ? 'down' : 'up',
      value: projects === 0 ? '0%' : atRisk > 2 ? '-5%' : '+12%',
    },
  };
};

const getTeamPerformance = async (workspaceId) => {
  const result = await User.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
    {
      $addFields: {
        teamName: {
          $cond: [
            {
              $regexMatch: {
                input: '$jobTitle',
                regex: /backend|api|database/i,
              },
            },
            'Backend',
            {
              $cond: [
                {
                  $regexMatch: { input: '$jobTitle', regex: /frontend|ui|ux/i },
                },
                'Frontend',
                {
                  $cond: [
                    { $regexMatch: { input: '$jobTitle', regex: /qa|test/i } },
                    'QA',
                    'Other',
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { $match: { teamName: { $ne: 'Other' } } },
    {
      $lookup: {
        from: 'tasks',
        localField: '_id',
        foreignField: 'assignedUser',
        as: 'tasks',
      },
    },
    { $unwind: { path: '$tasks', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$teamName',
        totalTasks: { $sum: { $cond: [{ $ifNull: ['$tasks', false] }, 1, 0] } },
        completedTasks: {
          $sum: { $cond: [{ $eq: ['$tasks.status', 'done'] }, 1, 0] },
        },
        blockedTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ifNull: ['$tasks', false] },
                  { $eq: ['$tasks.blocked', true] },
                  { $ne: ['$tasks.status', 'done'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return result.map((group) => {
    const progress = calculateProgress(group.totalTasks, group.completedTasks);
    const loadPercentage =
      group.totalTasks > 0 ? Math.min(100, group.totalTasks * 15) : 0;
    return {
      team: group._id,
      progress: `${progress.percentage}%`,
      velocity:
        progress.percentage > 70
          ? 'up'
          : progress.percentage < 30
            ? 'down'
            : 'stable',
      load: `${loadPercentage}%`,
      blockers: group.blockedTasks,
      status:
        group.blockedTasks > 2
          ? 'red'
          : group.blockedTasks > 0
            ? 'yellow'
            : 'green',
    };
  });
};

const getActivityFeed = async (workspaceId) => {
  const logs = await AuditLog.find({ workspaceId })
    .sort('-timestamp')
    .limit(8)
    .populate('performer', 'name')
    .lean();
  return logs.map((log) => ({
    text: `${log.performer?.name || 'System'} -> ${log.action}`,
    time: formatTimeAgo(log.timestamp),
  }));
};

const getCTOSpecifics = async (workspaceId) => {
  const [
    atRiskCount,
    totalBlockers,
    totalEngineers,
    sprintTasks,
    blockedTasks,
    totalTasks,
    doneTasks,
  ] = await Promise.all([
    Project.countDocuments({ workspaceId, status: 'at_risk' }),
    Task.countDocuments({
      workspaceId,
      blocked: true,
      status: { $ne: 'done' },
    }),
    User.countDocuments({ workspaceId, role: { $regex: /ENGINEER/i } }),
    Task.aggregate([
      { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } })
      .limit(5)
      .populate('assignedUser', 'role')
      .lean(),
    Task.countDocuments({ workspaceId }),
    Task.countDocuments({ workspaceId, status: 'done' }),
  ]);

  const pipeline = {
    backlog: sprintTasks.find((t) => t._id === 'todo')?.count || 0,
    dev: sprintTasks.find((t) => t._id === 'in_progress')?.count || 0,
    qa: sprintTasks.find((t) => t._id === 'in_review')?.count || 0,
    release: sprintTasks.find((t) => t._id === 'done')?.count || 0,
  };

  const categorizedBlockers = { engineering: [], qa: [], hr: [] };
  blockedTasks.forEach((task) => {
    const role = task.assignedUser?.role || 'ENGINEERING';
    if (role.includes('QA')) categorizedBlockers.qa.push(task.title);
    else if (role.includes('HR')) categorizedBlockers.hr.push(task.title);
    else categorizedBlockers.engineering.push(task.title);
  });

  const avgUtilization =
    totalEngineers > 0
      ? Math.min(
          95,
          Math.round(((totalTasks - doneTasks) / (totalEngineers * 5)) * 100)
        )
      : 0;
  const completionRate =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return {
    global: {
      projectsAtRisk: atRiskCount,
      totalBlockers: totalBlockers,
      orgDeliveryDrift: atRiskCount > 0 ? atRiskCount * 1.5 : 0,
      avgUtilization,
      teamsOverloaded: atRiskCount > 2 ? 1 : 0,
    },
    functionalBreakdown: {
      engineeringLeadership: {
        activeProjects: atRiskCount,
        delayed: atRiskCount,
        avgDrift: atRiskCount,
        decisionsPending: 0,
      },
      engineeringIC: {
        totalEngineers,
        avgLoad: avgUtilization,
        overloaded: avgUtilization > 85 ? 1 : 0,
        completionRate,
      },
      qa: {
        activeCycles: atRiskCount > 0 ? 1 : 0,
        blockedTests: totalBlockers,
        bugBacklog: 0,
        avgDelay: 0,
      },
      hr: { hiringOpen: 0, attritionRisk: 0, avgLoad: 0, burnoutRiskTeams: 0 },
    },
    functionalTable: [
      {
        function: 'Engineering Leadership',
        load: atRiskCount > 0 ? 85 : 0,
        blockers: 0,
        delay: '0d',
        status: 'green',
      },
      {
        function: 'Engineering ICs',
        load: avgUtilization,
        blockers: totalBlockers,
        delay: atRiskCount > 0 ? `${atRiskCount}d` : '0d',
        status: atRiskCount > 0 ? 'yellow' : 'green',
      },
      {
        function: 'Quality Assurance',
        load: 0,
        blockers: 0,
        delay: '0d',
        status: 'green',
      },
      { function: 'HR', load: 0, blockers: 0, delay: '0d', status: 'green' },
    ],
    blockers: categorizedBlockers,
    pipeline,
  };
};

const getVPESpecifics = async (workspaceId) => {
  const [
    atRiskCount,
    totalBlockers,
    totalTasks,
    completedTasksCount,
    blockedTasks,
    activeProjects,
  ] = await Promise.all([
    Project.countDocuments({ workspaceId, status: 'at_risk' }),
    Task.countDocuments({
      workspaceId,
      blocked: true,
      status: { $ne: 'done' },
    }),
    Task.countDocuments({ workspaceId }),
    Task.countDocuments({ workspaceId, status: 'done' }),
    Task.find({ workspaceId, blocked: true, status: { $ne: 'done' } })
      .limit(5)
      .lean(),
    Project.find({ workspaceId }).limit(3).lean(),
  ]);

  const progress = calculateProgress(totalTasks, completedTasksCount);

  return {
    sprintExecution: {
      progress: progress.percentage,
      risk: atRiskCount > 2 ? 'HIGH' : atRiskCount > 0 ? 'MEDIUM' : 'LOW',
      completed: completedTasksCount,
      inProgress: Math.max(0, totalTasks - completedTasksCount - totalBlockers),
      blocked: totalBlockers,
    },
    blockers: {
      Technical: blockedTasks.slice(0, 2).map((t) => t.title),
      Strategic:
        atRiskCount > 0 ? ['Resource shift required for at-risk projects'] : [],
    },
    timeline: activeProjects.map((p) => ({
      project: p.name,
      drift: p.status === 'at_risk' ? '+2d' : 'On Track',
      status: p.status === 'at_risk' ? 'red' : 'green',
    })),
  };
};

const getTLSpecifics = async (workspaceId) => {
  const workspaceObjId = new mongoose.Types.ObjectId(workspaceId);

  const [
    totalTasksCount,
    doneTasksCount,
    inProgressTasksCount,
    inReviewTasksCount,
    blockedTasksCount,
    bugTasksCount,
    projectsCount,
    services,
    testCases,
  ] = await Promise.all([
    Task.countDocuments({ workspaceId: workspaceObjId }),
    Task.countDocuments({ workspaceId: workspaceObjId, status: 'done' }),
    Task.countDocuments({ workspaceId: workspaceObjId, status: 'in_progress' }),
    Task.countDocuments({ workspaceId: workspaceObjId, status: 'in_review' }),
    Task.countDocuments({
      workspaceId: workspaceObjId,
      blocked: true,
      status: { $ne: 'done' },
    }),
    Task.countDocuments({
      workspaceId: workspaceObjId,
      type: 'bug',
      status: { $ne: 'done' },
    }),
    Project.countDocuments({ workspaceId: workspaceObjId }),
    Service.find({ workspaceId: workspaceObjId })
      .populate('owner', 'name')
      .lean(),
    TestCase.find({ workspaceId: workspaceObjId }).lean(),
  ]);

  const activeBlockers = await Task.find({
    workspaceId: workspaceObjId,
    blocked: true,
    status: { $ne: 'done' },
  })
    .limit(5)
    .lean();

  const healthyServices = services.filter((s) => s.status === 'healthy').length;
  const highRiskModules = services.filter(
    (s) => (s.technicalDebt?.score || 0) > 70
  ).length;

  const buildLogs = await AuditLog.find({
    workspaceId: workspaceObjId,
    action: { $regex: /BUILD|DEPLOY/i },
  })
    .sort('-timestamp')
    .limit(50)
    .lean();

  const successBuilds = buildLogs.filter(
    (l) => l.action === 'BUILD_SUCCESS' || l.action === 'DEPLOY_SUCCESS'
  ).length;
  const totalBuilds = buildLogs.length;
  const successRate =
    totalBuilds > 0 ? Math.round((successBuilds / totalBuilds) * 100) : 0;
  const changeFailureRateVal =
    totalBuilds > 0
      ? Math.round(((totalBuilds - successBuilds) / totalBuilds) * 100)
      : 0;

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 3);

  const codeLogs = await AuditLog.find({
    workspaceId: workspaceObjId,
    action: { $regex: /COMMIT|PR|MERGE/i },
    timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  }).lean();

  const stalePRLogs = await AuditLog.aggregate([
    {
      $match: {
        workspaceId: workspaceObjId,
        action: 'PR_OPEN',
        timestamp: { $lt: staleThreshold },
      },
    },
    {
      $lookup: {
        from: 'auditlogs',
        let: { prId: '$details.prId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$details.prId', '$$prId'] },
                  { $in: ['$action', ['PR_MERGED', 'PR_CLOSED']] },
                ],
              },
            },
          },
        ],
        as: 'resolution',
      },
    },
    { $match: { resolution: { $size: 0 } } },
  ]);

  const bugTrackerRaw = await Task.find({
    workspaceId: workspaceObjId,
    type: 'bug',
    status: { $ne: 'done' },
  })
    .limit(10)
    .lean();

  // Active Sprint
  const activeSprint = await Sprint.findOne({
    workspaceId: workspaceObjId,
    status: 'active',
  }).lean();
  let sprintProgress = 0;
  let sprintCompletedPoints = 0;
  let sprintTotalPoints = 0;

  if (activeSprint) {
    const [sprintTotal, sprintDone] = await Promise.all([
      Task.countDocuments({
        workspaceId: workspaceObjId,
        sprint: activeSprint._id,
      }),
      Task.countDocuments({
        workspaceId: workspaceObjId,
        sprint: activeSprint._id,
        status: 'done',
      }),
    ]);
    if (sprintTotal > 0) {
      sprintProgress = Math.round((sprintDone / sprintTotal) * 100);
      sprintCompletedPoints = sprintDone;
      sprintTotalPoints = sprintTotal;
    }
  }

  // Burndown Data
  const burndownData = [];
  if (activeSprint) {
    const startDate = new Date(activeSprint.startDate);
    const endDate = new Date(activeSprint.endDate);
    const sprintDays = Math.max(
      1,
      Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
    );

    // Fetch tasks completed inside this sprint's duration
    const sprintTasks = await Task.find({
      workspaceId: workspaceObjId,
      sprint: activeSprint._id,
    })
      .select('completedAt')
      .lean();

    for (let i = 0; i <= sprintDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = currentDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const ideal = Math.max(
        0,
        Math.round(sprintTotalPoints - (sprintTotalPoints / sprintDays) * i)
      );

      const isPast = currentDate <= new Date();
      let remaining = undefined;
      let completed = undefined;

      if (isPast) {
        // Count tasks in sprint completed on or before currentDate
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);
        const doneOnOrBefore = sprintTasks.filter(
          (t) => t.completedAt && new Date(t.completedAt) <= endOfDay
        ).length;
        remaining = Math.max(0, sprintTotalPoints - doneOnOrBefore);
        completed = doneOnOrBefore;
      }

      burndownData.push({
        date: dateStr,
        ideal,
        remaining,
        completed,
      });
    }
  }

  // Cycle Time Calculation
  const completedTasksWithTimes = await Task.find({
    workspaceId: workspaceObjId,
    status: 'done',
    startedAt: { $ne: null },
    completedAt: { $ne: null },
  })
    .select('startedAt completedAt')
    .lean();

  let avgCycleTime = 0;
  if (completedTasksWithTimes.length > 0) {
    const totalDiff = completedTasksWithTimes.reduce((acc, t) => {
      const diff = new Date(t.completedAt) - new Date(t.startedAt);
      return acc + diff;
    }, 0);
    const avgMs = totalDiff / completedTasksWithTimes.length;
    const avgDays = avgMs / (1000 * 60 * 60 * 24);
    avgCycleTime = parseFloat(avgDays.toFixed(1));
  }

  // Code Health Score
  let codeHealthScore = 100;
  if (services.length > 0) {
    const avgDebt =
      services.reduce((acc, s) => acc + (s.technicalDebt?.score || 0), 0) /
      services.length;
    codeHealthScore = Math.max(
      0,
      Math.round(100 - avgDebt - bugTasksCount * 1.5)
    );
  } else {
    codeHealthScore =
      bugTasksCount > 0 ? Math.max(0, 100 - bugTasksCount * 5) : 100;
  }

  // Top Priorities Checklist
  const prioritiesRaw = await Task.find({
    workspaceId: workspaceObjId,
    status: { $ne: 'done' },
  })
    .sort('-priority')
    .limit(4)
    .populate('project')
    .lean();

  const topPriorities = prioritiesRaw.map((t, idx) => {
    let progress = 0;
    if (t.status === 'in_progress') progress = 40;
    if (t.status === 'in_review') progress = 75;
    if (t.status === 'blocked') progress = 10;

    if (t.steps && t.steps.length > 0) {
      const completedSteps = t.steps.filter((s) => s.completed).length;
      progress = Math.round((completedSteps / t.steps.length) * 100);
    }

    return {
      id: t._id,
      code: `${t.project?.code || 'TSK'}-${t.taskNumber || idx + 100}`,
      title: t.title,
      tasksCount: t.steps?.length || 0,
      progress,
      severity:
        t.priority === 'urgent' || t.priority === 'high'
          ? 'High'
          : t.priority === 'medium'
            ? 'Medium'
            : 'Low',
    };
  });

  // Team Velocity Sprints
  const pastSprints = await Sprint.find({
    workspaceId: workspaceObjId,
    status: { $ne: 'upcoming' },
  })
    .sort('startDate')
    .limit(6)
    .lean();
  const velocityData = [];
  for (const s of pastSprints) {
    const doneTasks = await Task.countDocuments({
      workspaceId: workspaceObjId,
      sprint: s._id,
      status: 'done',
    });
    velocityData.push({
      sprint: s.name,
      commitment: 0,
      completed: doneTasks,
    });
  }

  // Workloads of active users
  const users = await User.find({ workspaceId: workspaceObjId })
    .limit(10)
    .lean();
  const workloads = await Promise.all(
    users.map(async (u) => {
      const userTasksCount = await Task.countDocuments({
        workspaceId: workspaceObjId,
        assignedUser: u._id,
        status: { $ne: 'done' },
      });
      const load = Math.min(100, userTasksCount * 20);
      return {
        member: u.name,
        load: load,
        status:
          load > 85 ? 'Overallocated' : load > 60 ? 'Committed' : 'Available',
      };
    })
  );

  // Code Health Overview Card
  const passedTests = testCases.filter((t) => t.status === 'passed').length;
  const totalTests = testCases.length;
  const avgCoverage =
    totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  let prevCoverage = 0;
  if (activeSprint && activeSprint.startDate) {
    const prevTestCases = testCases.filter(
      (t) => new Date(t.createdAt) < new Date(activeSprint.startDate)
    );
    const prevPass = prevTestCases.filter((t) => t.status === 'passed').length;
    prevCoverage =
      prevTestCases.length > 0
        ? Math.round((prevPass / prevTestCases.length) * 100)
        : 0;
  } else {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const prevTestCases = testCases.filter(
      (t) => new Date(t.createdAt) < sevenDaysAgo
    );
    const prevPass = prevTestCases.filter((t) => t.status === 'passed').length;
    prevCoverage =
      prevTestCases.length > 0
        ? Math.round((prevPass / prevTestCases.length) * 100)
        : 0;
  }

  const eslintIssues = services.reduce(
    (acc, s) => acc + (s.eslintIssues || 0),
    0
  );
  const securityIssues = services.reduce(
    (acc, s) => acc + (s.securityIssues || 0),
    0
  );
  const totalTechnicalDebtDays = services.reduce(
    (acc, s) => acc + (s.technicalDebt?.score || 0) * 0.05,
    0
  );

  // Upcoming deadlines from future sprints
  const upcomingSprints = await Sprint.find({
    workspaceId: workspaceObjId,
    status: 'upcoming',
  })
    .sort('startDate')
    .limit(3)
    .lean();
  const upcomingDeadlines = upcomingSprints.map((sprint) => {
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(sprint.endDate) - new Date()) / (1000 * 60 * 60 * 24))
    );
    return {
      title: `Release v${sprint.name}`,
      date: new Date(sprint.endDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      daysLeft,
    };
  });

  // Recent Activity Feed
  const logs = await AuditLog.find({ workspaceId: workspaceObjId })
    .sort('-timestamp')
    .limit(5)
    .populate('performer', 'name')
    .lean();

  const recentActivity = logs.map((l) => {
    let type = 'commit';
    if (l.action.includes('PR_MERGE')) type = 'pr_merge';
    else if (l.action.includes('DEPLOY')) type = 'deploy';
    else if (l.action.includes('PR_OPEN')) type = 'pr_open';
    else if (l.action.includes('FAIL')) type = 'build_fail';

    return {
      type,
      title: l.action.replace(/_/g, ' '),
      desc:
        l.details?.message ||
        `${l.performer?.name || 'System'} executed ${l.action}`,
      time: formatTimeAgo(l.timestamp),
    };
  });

  // Pull request matching on details.prId
  const prOpenLogs = await AuditLog.find({
    workspaceId: workspaceObjId,
    action: 'PR_OPEN',
  }).lean();
  const prMergedLogs = await AuditLog.find({
    workspaceId: workspaceObjId,
    action: 'PR_MERGED',
  }).lean();

  let totalPrCycleTimeMs = 0;
  let pairedPrCount = 0;
  prMergedLogs.forEach((mergedLog) => {
    const prId = mergedLog.details?.prId;
    if (prId) {
      const openLog = prOpenLogs.find((open) => open.details?.prId === prId);
      if (openLog) {
        totalPrCycleTimeMs +=
          new Date(mergedLog.timestamp) - new Date(openLog.timestamp);
        pairedPrCount++;
      }
    }
  });

  const prCycleTimeHours =
    pairedPrCount > 0
      ? parseFloat(
          (totalPrCycleTimeMs / pairedPrCount / (1000 * 60 * 60)).toFixed(1)
        )
      : 0;

  const prReviewTimeHours =
    pairedPrCount > 0 ? parseFloat((prCycleTimeHours * 0.35).toFixed(1)) : 0;

  // Sparkline history generators (last 5 days)
  const sparklineDoneHistory = [];
  const sparklineCycleHistory = [];
  const sparklineFreqHistory = [];
  const sparklineFailureHistory = [];

  for (let i = 4; i >= 0; i--) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - i);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const completedCount = await Task.countDocuments({
      workspaceId: workspaceObjId,
      status: 'done',
      completedAt: { $lte: endOfDay },
    });
    sparklineDoneHistory.push({ val: completedCount });

    const completedTasksUpToDay = await Task.find({
      workspaceId: workspaceObjId,
      status: 'done',
      completedAt: { $lte: endOfDay },
      startedAt: { $ne: null },
    })
      .select('startedAt completedAt')
      .lean();
    let avgCycle = 0;
    if (completedTasksUpToDay.length > 0) {
      const totalDiff = completedTasksUpToDay.reduce(
        (acc, t) => acc + (new Date(t.completedAt) - new Date(t.startedAt)),
        0
      );
      avgCycle = parseFloat(
        (
          totalDiff /
          completedTasksUpToDay.length /
          (1000 * 60 * 60 * 24)
        ).toFixed(1)
      );
    }
    sparklineCycleHistory.push({ val: avgCycle });

    const deployCount = await AuditLog.countDocuments({
      workspaceId: workspaceObjId,
      action: 'DEPLOY_SUCCESS',
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    });
    sparklineFreqHistory.push({ val: deployCount });

    const dayBuilds = await AuditLog.find({
      workspaceId: workspaceObjId,
      action: { $regex: /BUILD|DEPLOY/i },
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    }).lean();
    const dayFailed = dayBuilds.filter((l) => l.action.includes('FAIL')).length;
    const dayFailureRate =
      dayBuilds.length > 0
        ? Math.round((dayFailed / dayBuilds.length) * 100)
        : 0;
    sparklineFailureHistory.push({ val: dayFailureRate });
  }

  // PR Metrics History
  const prCycleTimeHistory = [];
  const prsMergedHistory = [];
  const prReviewTimeHistory = [];

  for (let i = 3; i >= 0; i--) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - i);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dayPrOpenLogs = await AuditLog.find({
      workspaceId: workspaceObjId,
      action: 'PR_OPEN',
      timestamp: { $lte: endOfDay },
    }).lean();
    const dayPrMergedLogs = await AuditLog.find({
      workspaceId: workspaceObjId,
      action: 'PR_MERGED',
      timestamp: { $lte: endOfDay },
    }).lean();

    let dayTotalCycleTime = 0;
    let dayPairedCount = 0;
    dayPrMergedLogs.forEach((merged) => {
      const prId = merged.details?.prId;
      if (prId) {
        const open = dayPrOpenLogs.find((o) => o.details?.prId === prId);
        if (open) {
          dayTotalCycleTime +=
            new Date(merged.timestamp) - new Date(open.timestamp);
          dayPairedCount++;
        }
      }
    });

    const dayAvgCycle =
      dayPairedCount > 0
        ? parseFloat(
            (dayTotalCycleTime / dayPairedCount / (1000 * 60 * 60)).toFixed(1)
          )
        : 0;
    prCycleTimeHistory.push({ val: dayAvgCycle });
    prsMergedHistory.push({ val: dayPrMergedLogs.length });
    prReviewTimeHistory.push({
      val: parseFloat((dayAvgCycle * 0.35).toFixed(1)),
    });
  }

  // Cross-team dependencies flowchart representation
  const crossTeamDependencies = [];
  services.forEach((s) => {
    if (s.dependencies && s.dependencies.length > 0) {
      s.dependencies.forEach((depId) => {
        const depService = services.find(
          (serv) => serv._id.toString() === depId.toString()
        );
        if (depService) {
          crossTeamDependencies.push({
            source: depService.name,
            sourceTeam: depService.owner?.name || 'Platform Team',
            target: s.name,
            targetTeam: s.owner?.name || 'This Team',
            status:
              depService.status === 'healthy'
                ? 'On Track'
                : depService.status === 'degraded'
                  ? 'At Risk'
                  : 'Blocking',
          });
        }
      });
    }
  });

  // Sprint metrics comparisons
  const getSprintMetrics = async (sprint) => {
    if (!sprint) return null;
    const [totalTasks, doneTasks] = await Promise.all([
      Task.countDocuments({ workspaceId: workspaceObjId, sprint: sprint._id }),
      Task.countDocuments({
        workspaceId: workspaceObjId,
        sprint: sprint._id,
        status: 'done',
      }),
    ]);
    const progress =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const tasksWithTimes = await Task.find({
      workspaceId: workspaceObjId,
      sprint: sprint._id,
      status: 'done',
      startedAt: { $ne: null },
      completedAt: { $ne: null },
    })
      .select('startedAt completedAt')
      .lean();
    let cycleTime = 0;
    if (tasksWithTimes.length > 0) {
      const totalDiff = tasksWithTimes.reduce(
        (acc, t) => acc + (new Date(t.completedAt) - new Date(t.startedAt)),
        0
      );
      cycleTime = parseFloat(
        (totalDiff / tasksWithTimes.length / (1000 * 60 * 60 * 24)).toFixed(1)
      );
    }

    const sBuildLogs = await AuditLog.find({
      workspaceId: workspaceObjId,
      action: { $regex: /BUILD|DEPLOY/i },
      timestamp: { $gte: sprint.startDate, $lte: sprint.endDate },
    }).lean();
    const sDeployCount = sBuildLogs.filter(
      (l) => l.action === 'DEPLOY_SUCCESS'
    ).length;
    const sSuccessBuilds = sBuildLogs.filter(
      (l) => l.action === 'BUILD_SUCCESS' || l.action === 'DEPLOY_SUCCESS'
    ).length;
    const sFailureRate =
      sBuildLogs.length > 0
        ? Math.round(
            ((sBuildLogs.length - sSuccessBuilds) / sBuildLogs.length) * 100
          )
        : 0;

    return {
      progress,
      completedStories: doneTasks,
      totalStories: totalTasks,
      cycleTime,
      deployCount: sDeployCount,
      failureRate: sFailureRate,
    };
  };

  let prevSprint = null;
  if (activeSprint) {
    prevSprint = await Sprint.findOne({
      workspaceId: workspaceObjId,
      status: 'completed',
      endDate: { $lte: activeSprint.startDate },
    })
      .sort('-endDate')
      .lean();
  } else {
    const completedSprints = await Sprint.find({
      workspaceId: workspaceObjId,
      status: 'completed',
    })
      .sort('-endDate')
      .limit(2)
      .lean();
    if (completedSprints.length > 1) {
      prevSprint = completedSprints[1];
    }
  }

  const activeMetrics = activeSprint
    ? await getSprintMetrics(activeSprint)
    : null;
  const prevMetrics = prevSprint ? await getSprintMetrics(prevSprint) : null;

  const comparisons =
    activeMetrics && prevMetrics
      ? {
          sprintProgress: {
            diff: activeMetrics.progress - prevMetrics.progress,
            direction:
              activeMetrics.progress >= prevMetrics.progress ? 'up' : 'down',
          },
          storiesCompleted: {
            diff: activeMetrics.completedStories - prevMetrics.completedStories,
            direction:
              activeMetrics.completedStories >= prevMetrics.completedStories
                ? 'up'
                : 'down',
          },
          cycleTime: {
            diff: parseFloat(
              (activeMetrics.cycleTime - prevMetrics.cycleTime).toFixed(1)
            ),
            direction:
              activeMetrics.cycleTime <= prevMetrics.cycleTime ? 'down' : 'up',
          },
          deployCount: {
            diff: activeMetrics.deployCount - prevMetrics.deployCount,
            direction:
              activeMetrics.deployCount >= prevMetrics.deployCount
                ? 'up'
                : 'down',
          },
          failureRate: {
            diff: parseFloat(
              (activeMetrics.failureRate - prevMetrics.failureRate).toFixed(1)
            ),
            direction:
              activeMetrics.failureRate <= prevMetrics.failureRate
                ? 'down'
                : 'up',
          },
        }
      : null;

  // Code Health Comparison
  const prevBugCount = await Task.countDocuments({
    workspaceId: workspaceObjId,
    type: 'bug',
    status: { $ne: 'done' },
    createdAt: { $lt: activeSprint ? activeSprint.startDate : new Date() },
  });
  const bugDiff = bugTasksCount - prevBugCount;
  const codeHealthDiff = -bugDiff * 1.5;

  const codeHealthComparison = {
    diff: parseFloat(codeHealthDiff.toFixed(1)),
    direction: codeHealthDiff >= 0 ? 'up' : 'down',
  };

  const coverageDiff = avgCoverage - prevCoverage;

  const finalComparisons = comparisons || {
    sprintProgress: null,
    storiesCompleted: null,
    cycleTime: null,
    deployCount: null,
    failureRate: null,
  };

  finalComparisons.codeHealth = codeHealthComparison;
  finalComparisons.coverage = {
    diff: coverageDiff,
    direction: coverageDiff >= 0 ? 'up' : 'down',
  };
  finalComparisons.eslint = {
    diff: 0,
    direction: 'down',
  };
  finalComparisons.security = {
    diff: 0,
    direction: 'down',
  };
  finalComparisons.debtDays = {
    diff: 0,
    direction: 'down',
  };

  // PR Metrics comparisons (last 7 days vs 7 days before)
  const getPrMetricsForPeriod = async (startDate, endDate) => {
    const periodOpenLogs = await AuditLog.find({
      workspaceId: workspaceObjId,
      action: 'PR_OPEN',
      timestamp: { $gte: startDate, $lte: endDate },
    }).lean();
    const periodMergedLogs = await AuditLog.find({
      workspaceId: workspaceObjId,
      action: 'PR_MERGED',
      timestamp: { $gte: startDate, $lte: endDate },
    }).lean();

    let periodTotalCycleTime = 0;
    let periodPairedCount = 0;
    periodMergedLogs.forEach((merged) => {
      const prId = merged.details?.prId;
      if (prId) {
        const open = periodOpenLogs.find((o) => o.details?.prId === prId);
        if (open) {
          periodTotalCycleTime +=
            new Date(merged.timestamp) - new Date(open.timestamp);
          periodPairedCount++;
        }
      }
    });

    const avgCycle =
      periodPairedCount > 0
        ? periodTotalCycleTime / periodPairedCount / (1000 * 60 * 60)
        : 0;
    return {
      cycleTime: avgCycle,
      mergedCount: periodMergedLogs.length,
      reviewTime: avgCycle * 0.35,
    };
  };

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const currentPrMetrics = await getPrMetricsForPeriod(sevenDaysAgo, now);
  const previousPrMetrics = await getPrMetricsForPeriod(
    fourteenDaysAgo,
    sevenDaysAgo
  );

  const prComparisons = {
    cycleTime: {
      diff: parseFloat(
        (currentPrMetrics.cycleTime - previousPrMetrics.cycleTime).toFixed(1)
      ),
      direction:
        currentPrMetrics.cycleTime <= previousPrMetrics.cycleTime
          ? 'down'
          : 'up',
    },
    mergedCount: {
      diff: currentPrMetrics.mergedCount - previousPrMetrics.mergedCount,
      direction:
        currentPrMetrics.mergedCount >= previousPrMetrics.mergedCount
          ? 'up'
          : 'down',
    },
    reviewTime: {
      diff: parseFloat(
        (currentPrMetrics.reviewTime - previousPrMetrics.reviewTime).toFixed(1)
      ),
      direction:
        currentPrMetrics.reviewTime <= previousPrMetrics.reviewTime
          ? 'down'
          : 'up',
    },
  };

  const deploysThisWeek = await AuditLog.countDocuments({
    workspaceId: workspaceObjId,
    action: 'DEPLOY_SUCCESS',
    timestamp: { $gte: sevenDaysAgo },
  });

  return {
    systemHealth: {
      servicesHealthy:
        services.length > 0
          ? `${healthyServices}/${services.length}`
          : projectsCount > 0
            ? 'All Systems Go'
            : 'No Active Projects',
      criticalBlockers: blockedTasksCount,
      highRiskModules: highRiskModules,
      openBugs: bugTasksCount,
      buildStability: totalBuilds > 0 ? `${successRate}%` : '0%',
    },
    serviceMap: await Promise.all(
      services.map(async (s) => {
        const serviceLogs = await AuditLog.find({
          workspaceId: workspaceObjId,
          $or: [
            { 'details.serviceId': s._id },
            { action: { $regex: new RegExp(s.name, 'i') } },
          ],
        })
          .sort('-timestamp')
          .limit(5)
          .lean();

        return {
          id: s._id.toString(),
          name: s.name,
          status: s.status,
          latency: `${s.latency || 0}ms`,
          errorRate: s.errorRate || 0,
          owner: s.owner?.name || 'Platform Team',
          dependencies: s.dependencies?.map((d) => d.toString()) || [],
          healthHistory: serviceLogs.map((l) => ({
            status: l.action.includes('FAIL')
              ? 'failing'
              : l.action.includes('DEGRADED')
                ? 'degraded'
                : 'healthy',
            time: formatTimeAgo(l.timestamp),
            event: l.action,
          })),
        };
      })
    ),
    blockers: activeBlockers.map((t) => ({
      id: t._id,
      title: t.title,
      severity: t.priority || 'high',
      impact: 'Deployment Delay',
      since: formatTimeAgo(t.updatedAt),
    })),
    bugTracker: bugTrackerRaw.map((b) => ({
      id: b._id,
      issue: b.title,
      severity: b.priority || 'medium',
      module: b.category || 'core',
      status: b.status,
    })),
    buildHealth: {
      lastBuild:
        buildLogs[0]?.action === 'BUILD_SUCCESS'
          ? 'SUCCESS'
          : buildLogs[0]?.action === 'BUILD_FAILED'
            ? 'FAILING'
            : 'NONE',
      successRate: `${successRate}%`,
      deployFrequency: `${deploysThisWeek}/W`,
      rollbackCount: buildLogs.filter((l) => l.action === 'ROLLBACK').length,
    },
    codeActivity: {
      commitsToday: codeLogs.filter((l) => l.action.includes('COMMIT')).length,
      prsOpen: codeLogs.filter((l) => l.action.includes('PR_OPEN')).length,
      prsMerged: codeLogs.filter((l) => l.action.includes('PR_MERGED')).length,
      stalePRs: stalePRLogs.length,
    },
    technicalDebt: services
      .filter((s) => (s.technicalDebt?.score || 0) > 30)
      .map((s) => ({
        module: s.name,
        reason: s.technicalDebt?.notes || 'Refactor Required',
        debtLevel: (s.technicalDebt?.score || 0) > 70 ? 'High' : 'Medium',
      })),

    sprintProgress,
    storiesCompleted: {
      completed: sprintCompletedPoints,
      total: sprintTotalPoints,
    },
    cycleTime: {
      value: avgCycleTime,
      unit: 'days',
    },
    deploymentFrequency: {
      value: deploysThisWeek,
      unit: 'week',
    },
    changeFailureRate: {
      value: changeFailureRateVal,
    },
    codeHealthScore,
    workItemsStatus: {
      done: doneTasksCount,
      inProgress: inProgressTasksCount,
      inReview: inReviewTasksCount,
      blocked: blockedTasksCount,
      total: totalTasksCount,
    },
    burndownData,
    topPriorities,
    teamVelocity: velocityData,
    codeHealthOverview: {
      coverage: avgCoverage,
      eslint: eslintIssues,
      security: securityIssues,
      debtDays: parseFloat(totalTechnicalDebtDays.toFixed(1)),
    },
    pullRequestMetrics: {
      prCycleTime: prCycleTimeHours > 0 ? `${prCycleTimeHours}h` : '0h',
      prsMerged: prMergedLogs.length,
      prsOpen: prOpenLogs.length - pairedPrCount,
      reviewTime: prReviewTimeHours > 0 ? `${prReviewTimeHours}h` : '0h',
      prCycleTimeHistory,
      prsMergedHistory,
      prReviewTimeHistory,
    },
    recentActivity,
    teamWorkload: workloads,
    aiInsights: (() => {
      const dynamicAiInsights = [];
      if (highRiskModules > 0) {
        const highRiskServices = services
          .filter((s) => (s.technicalDebt?.score || 0) > 70)
          .map((s) => s.name);
        dynamicAiInsights.push({
          type: 'refactor',
          title: 'Refactor candidate',
          desc: `Complexity score is high for ${highRiskServices.join(', ')}. Consider refactoring.`,
          action: 'Action',
        });
      }
      if (bugTasksCount > 0) {
        const bugCategories = [
          ...new Set(bugTrackerRaw.map((b) => b.category).filter(Boolean)),
        ];
        const categoryStr =
          bugCategories.length > 0
            ? ` in ${bugCategories.join('/')} modules`
            : '';
        dynamicAiInsights.push({
          type: 'bug',
          title: 'Test gap detected',
          desc: `Add unit tests for error handling${categoryStr} affected by ${bugTasksCount} open defects.`,
          action: 'Action',
        });
      }
      if (blockedTasksCount > 0) {
        const blockReasons = [
          ...new Set(
            activeBlockers
              .map((b) => b.blockedReason || b.title)
              .filter(Boolean)
          ),
        ];
        const reasonsStr =
          blockReasons.length > 0 ? `: ${blockReasons.join(', ')}` : '';
        dynamicAiInsights.push({
          type: 'blocker',
          title: 'CI / Environment Blockers',
          desc: `${blockedTasksCount} task(s) currently blocked${reasonsStr}.`,
          action: 'Review',
        });
      }
      if (successRate > 80 && finalComparisons.deployCount?.diff > 0) {
        dynamicAiInsights.push({
          type: 'positive',
          title: 'Good performance',
          desc: `Deployment frequency improved by ${finalComparisons.deployCount.diff} deployment(s) compared to the last sprint.`,
          action: 'Positive',
        });
      } else if (successRate > 80) {
        dynamicAiInsights.push({
          type: 'positive',
          title: 'Good performance',
          desc: `Build stability is at optimal levels (${successRate}% success rate).`,
          action: 'Positive',
        });
      }
      return dynamicAiInsights;
    })(),
    upcomingDeadlines,
    comparisons: finalComparisons,
    prComparisons,
    crossTeamDependencies,
    sparklineDoneHistory,
    sparklineCycleHistory,
    sparklineFreqHistory,
    sparklineFailureHistory,
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
    Task.find(taskQuery)
      .sort('-priority -dueDate')
      .limit(50)
      .populate('assignedUser', 'name')
      .lean(),
    Sprint.findOne({ workspaceId, status: 'active' }).lean(),
  ]);

  const AVAILABLE_HOURS_WEEK = 40;
  const AVAILABLE_MINUTES_WEEK = AVAILABLE_HOURS_WEEK * 60;

  const teamWorkload = users.map((user) => {
    const userTasks = tasks.filter(
      (t) => t.assignedUser?._id.toString() === user._id.toString()
    );

    // V1: Legacy load calculation (tasks * 20)
    const load = Math.min(100, userTasks.length * 20);

    // V2: Accurate load calculation (estimatedDuration / capacity)
    // estimatedDuration is in minutes by default
    const totalMinutes = userTasks.reduce(
      (acc, t) => acc + (t.estimatedDuration || 30),
      0
    );
    const loadV2 = Math.round(
      Math.min(100, (totalMinutes / AVAILABLE_MINUTES_WEEK) * 100)
    );

    return {
      id: user._id,
      member: user.name,
      tasks: userTasks.length,
      load,
      loadV2,
      status: loadV2 > 90 ? 'red' : loadV2 > 70 ? 'yellow' : 'green',
    };
  });

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const taskBoard = tasks.map((t) => {
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
      priority: t.priority,
    };
  });

  const blockers = tasks
    .filter((t) => t.blocked)
    .map((t) => ({
      id: t._id,
      title: t.title,
      since: formatTimeAgo(t.updatedAt),
      reason: t.blockedReason || 'Environment / Dependency mismatch',
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
      delayRisk:
        blockers.length > 2 ? 'HIGH' : blockers.length > 0 ? 'MEDIUM' : 'LOW',
      blockedTasks: blockers.length,
      teamLoad: Math.round(
        teamWorkload.reduce((acc, m) => acc + m.load, 0) /
          (teamWorkload.length || 1)
      ),
      tasksDueToday: tasks.filter((t) => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toISOString().split('T')[0] === todayStr;
      }).length,
    },
    taskBoard,
    teamWorkload,
    blockers,
    burndown: {
      planned: totalTasks,
      completed: doneTasks,
      remaining: totalTasks - doneTasks,
      daysLeft,
    },
    distribution: {
      backend: tasks.filter(
        (t) =>
          t.category === 'backend' ||
          t.title.toLowerCase().includes('api') ||
          t.title.toLowerCase().includes('db') ||
          t.title.toLowerCase().includes('server')
      ).length,
      frontend: tasks.filter(
        (t) =>
          t.category === 'frontend' ||
          t.title.toLowerCase().includes('ui') ||
          t.title.toLowerCase().includes('design') ||
          t.title.toLowerCase().includes('css')
      ).length,
      qa: tasks.filter(
        (t) =>
          t.category === 'qa' ||
          t.title.toLowerCase().includes('test') ||
          t.title.toLowerCase().includes('bug') ||
          t.title.toLowerCase().includes('verify')
      ).length,
      other:
        tasks.length -
        (tasks.filter(
          (t) =>
            t.category === 'backend' ||
            t.title.toLowerCase().includes('api') ||
            t.title.toLowerCase().includes('db') ||
            t.title.toLowerCase().includes('server')
        ).length +
          tasks.filter(
            (t) =>
              t.category === 'frontend' ||
              t.title.toLowerCase().includes('ui') ||
              t.title.toLowerCase().includes('design') ||
              t.title.toLowerCase().includes('css')
          ).length +
          tasks.filter(
            (t) =>
              t.category === 'qa' ||
              t.title.toLowerCase().includes('test') ||
              t.title.toLowerCase().includes('bug') ||
              t.title.toLowerCase().includes('verify')
          ).length),
      imbalance:
        blockers.length > 3
          ? 'Heavy focus on Backend causing QA starvation'
          : null,
    },
    focusToday: taskBoard
      .filter((t) => t.due === 'Today' || t.priority === 'urgent')
      .map((t) => t.title)
      .slice(0, 3),
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
    getActivityFeed(workspaceId),
  ]);

  const roleSpecificData = await getRoleSpecificData(workspaceId, role, userId);

  return {
    ...getTacticalBase(activity),
    executionStats,
    teamGrid,
    ...roleSpecificData,
  };
};

const getRoleBreakdown = async (workspaceId, category) => {
  const rolesMap = {
    leadership: [
      'WORKSPACE_ADMIN',
      'VP_ENGINEERING',
      'ENGINEERING_MANAGER',
      'TECH_LEAD',
    ],
    engineering: ['SENIOR_ENGINEER', 'SOFTWARE_ENGINEER', 'INTERN'],
    qa: ['QA_LEAD', 'QA', 'SQA'],
    people: ['HR'],
  };

  const targetRoles = rolesMap[category.toLowerCase()] || [];

  return User.aggregate([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        role: { $in: targetRoles },
      },
    },
    {
      $lookup: {
        from: 'tasks',
        localField: '_id',
        foreignField: 'assignedUser',
        as: 'tasks',
      },
    },
    {
      $project: {
        role: 1,
        taskCount: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 't',
              cond: { $ne: ['$$t.status', 'done'] },
            },
          },
        },
        totalHours: { $sum: '$tasks.estimatedDuration' },
      },
    },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        avgLoad: { $avg: { $divide: ['$totalHours', 40] } },
      },
    },
    {
      $project: {
        role: '$_id',
        count: 1,
        avgLoad: {
          $multiply: [{ $ifNull: [{ $round: ['$avgLoad', 2] }, 0] }, 100],
        },
        status: { $cond: [{ $gt: ['$avgLoad', 1] }, 'red', 'green'] },
      },
    },
  ]);
};

const getIndividualBreakdown = async (workspaceId, role) => {
  return User.aggregate([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        role: role.toUpperCase(),
      },
    },
    {
      $lookup: {
        from: 'tasks',
        localField: '_id',
        foreignField: 'assignedUser',
        as: 'tasks',
      },
    },
    {
      $project: {
        name: 1,
        role: 1,
        tasks: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 't',
              cond: { $ne: ['$$t.status', 'done'] },
            },
          },
        },
        load: {
          $multiply: [
            { $divide: [{ $sum: '$tasks.estimatedDuration' }, 40] },
            100,
          ],
        },
      },
    },
    {
      $project: {
        name: 1,
        role: 1,
        tasks: 1,
        load: { $round: ['$load', 0] },
        status: { $cond: [{ $gt: ['$load', 100] }, 'red', 'green'] },
      },
    },
  ]);
};

const getProjectWarRoomData = async (workspaceId, projectId) => {
  const [project, activeSprint, tasks, directives] = await Promise.all([
    Project.findById(projectId).populate('members', 'name role avatar').lean(),
    Sprint.findOne({ workspaceId, status: 'active' }).lean(),
    Task.find({ projectId }).populate('assignedUser', 'name role').lean(),
    require('../models/Directive')
      .find({ workspaceId, status: 'issued' })
      .sort('-priority')
      .limit(3)
      .lean(),
  ]);

  if (!project) return null;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const blockedTasks = tasks.filter((t) => t.blocked && t.status !== 'done');
  const criticalTasks = tasks.filter(
    (t) =>
      (t.priority === 'urgent' || t.priority === 'high') && t.status !== 'done'
  );

  const progress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate Drift
  const overdueCount = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done'
  ).length;
  const health =
    overdueCount > 5 || blockedTasks.length > 3
      ? 'AT_RISK'
      : overdueCount > 0
        ? 'NEEDS_ATTENTION'
        : 'ON_TRACK';

  return {
    project: {
      name: project.name,
      key: project.key,
      health,
      progress,
      membersCount: project.members.length,
    },
    sprint: activeSprint
      ? {
          name: activeSprint.name,
          daysLeft: Math.max(
            0,
            Math.ceil(
              (new Date(activeSprint.endDate) - new Date()) /
                (1000 * 60 * 60 * 24)
            )
          ),
        }
      : null,
    metrics: {
      total: totalTasks,
      completed: completedTasks,
      blocked: blockedTasks.length,
      critical: criticalTasks.length,
      drift: overdueCount > 0 ? `+${overdueCount}d` : '0d',
    },
    blockers: blockedTasks.map((t) => ({
      id: t._id,
      title: t.title,
      owner: t.assignedUser?.name || 'Unassigned',
      reason: t.blockedReason || 'Unknown',
    })),
    directives: directives.map((d) => ({
      id: d._id,
      title: d.title,
      type: d.type,
      priority: d.priority,
    })),
    criticalPath: criticalTasks.slice(0, 5).map((t) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      owner: t.assignedUser?.name || 'Unassigned',
    })),
    reviewQueue: tasks
      .filter((t) => t.status === 'in_review')
      .map((t) => ({
        id: t._id,
        title: t.title,
        owner: t.assignedUser?.name || 'Unassigned',
        reviewers: t.reviewers,
      })),
    burnoutRisks: project.members
      .map((m) => {
        const userTasks = tasks.filter(
          (t) => t.assignedUser?._id.toString() === m._id.toString()
        );
        const load = Math.min(100, userTasks.length * 20); // Simplified load for now
        return { name: m.name, load, role: m.role };
      })
      .filter((m) => m.load >= 80),
    eventFeed: await AuditLog.find({ 'details.projectId': projectId })
      .sort('-timestamp')
      .limit(10)
      .populate('performer', 'name')
      .lean()
      .then((logs) =>
        logs.map((l) => ({
          text: `${l.performer?.name || 'System'} -> ${l.action}`,
          time: formatTimeAgo(l.timestamp),
        }))
      ),
  };
};

module.exports = {
  getLeadershipDashboard,
  getRoleBreakdown,
  getIndividualBreakdown,
  getProjectWarRoomData,
};
