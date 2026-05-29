const Task = require('../models/Task');
const Service = require('../models/Service');
const AuditLog = require('../models/AuditLog');
const Sprint = require('../models/Sprint');
const TestCase = require('../models/TestCase');
const User = require('../models/User');
const Project = require('../models/Project');
const {
  calculateProgress,
  mapTaskToDashboard,
  formatDueDate,
  formatTimeAgo,
} = require('../utils/dashboardHelpers');

const _getDefaultSteps = () => [
  { text: 'Analyze requirements', completed: false },
  { text: 'Implement solution', completed: false },
  { text: 'Self-test', completed: false },
];

const _getPRStats = async (userId, workspaceId) => {
  const [open, merged, review] = await Promise.all([
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      source: 'github',
      status: 'in_progress',
    }),
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      source: 'github',
      status: 'done',
    }),
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      status: 'in_review',
    }),
  ]);

  return { open, merged, pendingReview: review };
};

const _getActivityFeed = async (userId, workspaceId) => {
  const logs = await AuditLog.find({
    performer: userId,
    workspaceId,
  })
    .sort('-timestamp')
    .limit(5)
    .lean();

  return logs.map((log) => ({
    action: log.action,
    time: formatTimeAgo(log.timestamp),
  }));
};

const _getActivityCounts = async (userId, workspaceId, startOfDay) => {
  const [commits, merged] = await Promise.all([
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      updatedAt: { $gte: startOfDay },
    }),
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      status: 'done',
      updatedAt: { $gte: startOfDay },
    }),
  ]);

  return {
    commitsToday: commits,
    filesChanged: 0,
    prsMerged: merged,
  };
};

const _getStalePR = async (workspaceId) => {
  const threshold = 48 * 60 * 60 * 1000; // 48h
  const cutoff = new Date(Date.now() - threshold);

  const staleTask = await Task.findOne({
    workspaceId,
    status: 'in_review',
    updatedAt: { $lt: cutoff },
  })
    .sort('updatedAt')
    .lean();

  if (!staleTask) return null;

  return {
    id: staleTask._id,
    title: staleTask.title,
    pendingDays: Math.floor(
      (Date.now() - staleTask.updatedAt) / (1000 * 60 * 60 * 24)
    ),
  };
};

const _getCommonMetrics = async (userId, workspaceId, today) => {
  const [myTasksCount, dueToday, blocked] = await Promise.all([
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      status: { $ne: 'done' },
    }),
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      status: { $ne: 'done' },
      dueDate: { $lte: today },
    }),
    Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      blocked: true,
      status: { $ne: 'done' },
    }),
  ]);

  return {
    myTasks: myTasksCount,
    dueToday,
    blocked,
    remaining: Math.max(0, myTasksCount - dueToday),
  };
};

const _getFilteredTasks = async (userId, workspaceId, subRole) => {
  const limit = 10; // Standardized limit for ICs
  const tasks = await Task.find({
    workspaceId,
    assignedUser: userId,
  })
    .sort('dueDate priority')
    .limit(limit)
    .populate('createdBy', 'name email')
    .lean();

  return tasks.map((t) => {
    const mapped = mapTaskToDashboard(t);
    if (subRole === 'INTERN' || subRole === 'JUNIOR_ENGINEER') {
      mapped.steps =
        t.steps && t.steps.length > 0 ? t.steps : _getDefaultSteps();
      mapped.mentor = t.createdBy
        ? { name: t.createdBy.name, role: 'Mentor' }
        : { name: 'Lead', role: 'Mentor' };
    }
    return mapped;
  });
};

const _getProgress = async (userId, workspaceId) => {
  const total = await Task.countDocuments({
    workspaceId,
    assignedUser: userId,
  });
  const completed = await Task.countDocuments({
    workspaceId,
    assignedUser: userId,
    status: 'done',
  });
  return calculateProgress(total, completed);
};

const _getSeniorEngineerData = async (userId, workspaceId) => {
  const [ownedModules, helpNeeded] = await Promise.all([
    Service.find({ workspaceId, owner: userId }).limit(5).lean(),
    Task.find({
      workspaceId,
      assignedUser: { $ne: userId },
      blocked: true,
      status: { $ne: 'done' },
    })
      .limit(3)
      .populate('assignedUser', 'name')
      .lean(),
  ]);

  return {
    moduleOwnership: ownedModules.map((s) => ({
      id: s._id,
      name: s.name,
      status: s.status,
      health: (s.technicalDebt?.score || 0) > 70 ? 'Needs refactor' : 'Stable',
    })),
    teamSupport: helpNeeded.map((t) => ({
      id: t._id,
      teamMember: t.assignedUser?.name || 'Unassigned',
      issue: t.title,
      reason: t.blockedReason || 'Technical Block',
    })),
  };
};

const _getGuidedData = async (userId, workspaceId, currentTask) => {
  const resources = {
    backend: [
      {
        title: 'PostgreSQL Optimization Guide',
        link: 'https://www.postgresql.org/docs/current/performance-tips.html',
      },
      {
        title: 'Node.js Security Best Practices',
        link: 'https://nodejs.org/en/docs/guides/security-best-practices/',
      },
    ],
    frontend: [
      {
        title: 'React Performance Tuning',
        link: 'https://reactjs.org/docs/optimizing-performance.html',
      },
      {
        title: 'TailwindCSS Layout Patterns',
        link: 'https://tailwindcss.com/docs/layout',
      },
    ],
    qa: [
      {
        title: 'Automated Testing Strategies',
        link: 'https://martinfowler.com/articles/practical-test-pyramid.html',
      },
      {
        title: 'Jest/Vitest Unit Testing',
        link: 'https://jestjs.io/docs/getting-started',
      },
    ],
    design: [
      {
        title: 'Typography & Visual Hierarchy',
        link: 'https://fonts.google.com/knowledge',
      },
      {
        title: 'Figma to Code Workflow',
        link: 'https://www.figma.com/developers/api',
      },
    ],
    default: [
      { title: 'NexaSetu System Architecture', link: '#' },
      {
        title: 'Clean Code Standards',
        link: 'https://github.com/ryanmcdermott/clean-code-javascript',
      },
    ],
  };

  const category = currentTask?.category || 'default';
  const activeResources = resources[category] || resources.default;

  return {
    learningSection: {
      topic: category.toUpperCase(),
      resources: activeResources,
    },
    nextStep: currentTask
      ? `Current Focus: ${currentTask.title}`
      : 'Consult Lead for next mission assignment',
  };
};

/**
 * Fetches workspace data based on specific sub-role
 */
const getWorkspaceData = async (userId, workspaceId, subRole) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Fetch active projects for this workspace
  const projects = await Project.find({ workspaceId })
    .select('name key')
    .lean();

  // 1. Core user tasks query
  const userTasks = await Task.find({ workspaceId, assignedUser: userId })
    .populate('project')
    .lean();
  const totalTasks = userTasks.length;
  const doneTasksCount = userTasks.filter((t) => t.status === 'done').length;
  const inProgressTasksCount = userTasks.filter(
    (t) => t.status === 'in_progress'
  ).length;
  const inReviewTasksCount = userTasks.filter(
    (t) => t.status === 'in_review'
  ).length;
  const blockedTasksCount = userTasks.filter(
    (t) => t.blocked || t.status === 'blocked'
  ).length;
  const todoTasksCount = userTasks.filter((t) => t.status === 'todo').length;

  const workItemsStatus = {
    done: doneTasksCount,
    inProgress: inProgressTasksCount,
    inReview: inReviewTasksCount,
    blocked: blockedTasksCount,
    todo: todoTasksCount,
    total: totalTasks,
  };

  const inProgressTasks = userTasks
    .filter((t) => t.status === 'in_progress')
    .map((t) => mapTaskToDashboard(t));
  const inReviewTasks = userTasks
    .filter((t) => t.status === 'in_review')
    .map((t) => mapTaskToDashboard(t));
  const doneTasks = userTasks
    .filter((t) => t.status === 'done')
    .map((t) => mapTaskToDashboard(t));

  // 2. Active Sprint calculations
  const activeSprint = await Sprint.findOne({
    workspaceId,
    status: 'active',
  }).lean();
  let sprintDaysLeft = 0;
  let sprintName = 'No Active Sprint';
  let sprintProgress = 0;

  if (activeSprint) {
    sprintName = activeSprint.name;
    const days = Math.ceil(
      (new Date(activeSprint.endDate) - today) / (1000 * 60 * 60 * 24)
    );
    sprintDaysLeft = Math.max(0, days);

    const sprintTasks = userTasks.filter(
      (t) => t.sprint && t.sprint.toString() === activeSprint._id.toString()
    );
    const sprintTotal = sprintTasks.length;
    const sprintDone = sprintTasks.filter((t) => t.status === 'done').length;
    sprintProgress =
      sprintTotal > 0 ? Math.round((sprintDone / sprintTotal) * 100) : 0;
  }

  // 3. Common metrics and tasks
  const [dayMetrics, myTasks, progress] = await Promise.all([
    _getCommonMetrics(userId, workspaceId, today),
    _getFilteredTasks(userId, workspaceId, subRole),
    _getProgress(userId, workspaceId),
  ]);

  const [prStats, activityFeed] = await Promise.all([
    _getPRStats(userId, workspaceId),
    _getActivityFeed(userId, workspaceId),
  ]);

  let extraData = {
    prStats,
    activityFeed,
    activity: activityFeed.map((a) => ({
      text: a.action,
      time: a.time,
      type: 'info',
    })),
    feedback: [],
  };

  // Role-specific extensions
  if (subRole === 'SENIOR_ENGINEER') {
    const seData = await _getSeniorEngineerData(userId, workspaceId);
    extraData = { ...extraData, ...seData };
  } else if (
    subRole === 'INTERN' ||
    subRole === 'SOFTWARE_ENGINEER' ||
    subRole === 'JUNIOR_ENGINEER' ||
    subRole === 'PROJECT_MEMBER' ||
    subRole === 'SWE'
  ) {
    const guidedData = await _getGuidedData(userId, workspaceId, myTasks[0]);

    // Fetch feedback from AuditLogs (e.g., status changes or mentor actions)
    const logs = await AuditLog.find({
      workspaceId,
      $or: [
        { entityId: myTasks[0]?._id },
        { performer: myTasks[0]?.createdBy },
      ],
      action: { $regex: /transition|update|comment/i },
    })
      .sort('-timestamp')
      .limit(3)
      .lean();

    extraData = {
      ...extraData,
      ...guidedData,
      feedback: logs.map((l) => ({
        title: l.action.replace(/_/g, ' '),
        message: l.details || 'System verified mission parameters.',
      })),
    };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const activityStats = await _getActivityCounts(
    userId,
    workspaceId,
    startOfDay
  );

  // Contextual Blockers for JRE/Intern
  const stuckGuidance = myTasks
    .filter((t) => t.blocked)
    .map((t) => {
      let suggestedAction = 'Connect with mentor for technical resolution.';
      let suggestedPerson = t.mentor?.name || 'Team Lead';

      if (t.blockedReason) {
        const reason = t.blockedReason.toLowerCase();
        if (
          reason.includes('api') ||
          reason.includes('backend') ||
          reason.includes('endpoint')
        ) {
          suggestedAction =
            'API dependency identified. Request status update from Backend team.';
        } else if (
          reason.includes('design') ||
          reason.includes('figma') ||
          reason.includes('ui')
        ) {
          suggestedAction =
            'Design assets missing. Check Figma comments or ping UI Designer.';
        } else if (reason.includes('review') || reason.includes('pr')) {
          suggestedAction =
            'Code review pending. Ping senior engineer for feedback.';
        } else if (reason.includes('access') || reason.includes('permission')) {
          suggestedAction =
            'Access issue. Request required credentials from Workspace Admin.';
        }
      } else if (t.dependencies && t.dependencies.length > 0) {
        suggestedAction =
          'Task has unmet dependencies. Coordinate with upstream owners.';
      }

      return {
        issue: t.title,
        suggestedAction,
        suggestedPerson,
      };
    });

  // 3. Past Sprints (moved up for metrics calculation)
  const pastSprints = await Sprint.find({
    workspaceId,
    status: { $ne: 'upcoming' },
  })
    .sort('startDate')
    .limit(6)
    .lean();

  // Delineate active and previous sprint windows for diff calculations
  let activeStart = new Date();
  activeStart.setDate(activeStart.getDate() - 14);
  let activeEnd = new Date();
  let prevStart = new Date();
  prevStart.setDate(prevStart.getDate() - 28);
  let prevEnd = new Date();
  prevEnd.setDate(prevEnd.getDate() - 14);

  if (activeSprint) {
    activeStart = new Date(activeSprint.startDate);
    activeEnd = new Date(activeSprint.endDate);

    const prevSprint = pastSprints[pastSprints.length - 1];
    if (prevSprint) {
      prevStart = new Date(prevSprint.startDate);
      prevEnd = new Date(prevSprint.endDate);
    } else {
      const sprintDurationMs = activeEnd - activeStart;
      prevStart = new Date(activeStart.getTime() - sprintDurationMs);
      prevEnd = new Date(activeStart);
    }
  }

  // 4. Code Quality & Code Health calculations
  const services = await Service.find({ workspaceId }).lean();
  let codeHealthScore = 100;
  if (services.length > 0) {
    const avgDebt =
      services.reduce((acc, s) => acc + (s.technicalDebt?.score || 0), 0) /
      services.length;
    codeHealthScore = Math.max(
      0,
      Math.round(100 - avgDebt - blockedTasksCount * 2)
    );
  } else {
    codeHealthScore =
      blockedTasksCount > 0 ? Math.max(0, 100 - blockedTasksCount * 5) : 100;
  }

  const testCases = await TestCase.find({ workspaceId }).lean();
  const passedTests = testCases.filter((t) => t.status === 'passed').length;
  const totalTests = testCases.length;
  const coverage =
    totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  const eslintIssues = services.reduce(
    (acc, s) => acc + (s.eslintIssues || 0),
    0
  );
  const securityIssues = services.reduce(
    (acc, s) => acc + (s.securityIssues || 0),
    0
  );
  const techDebt = services.reduce(
    (acc, s) => acc + (s.technicalDebt?.score || 0) * 0.05,
    0
  );

  const completedActiveTasks = userTasks.filter(
    (t) =>
      t.status === 'done' &&
      activeSprint &&
      t.sprint &&
      t.sprint.toString() === activeSprint._id.toString()
  );
  const completedBugs = completedActiveTasks.filter(
    (t) => t.type === 'bug' || t.title.toLowerCase().includes('bug')
  ).length;
  const completedTechDebt = completedActiveTasks.filter(
    (t) =>
      t.type === 'tech_debt' ||
      t.title.toLowerCase().includes('refactor') ||
      t.title.toLowerCase().includes('debt')
  ).length;

  const eslintDiff = -completedBugs;
  const techDebtDiff = parseFloat((-completedTechDebt * 0.1).toFixed(1));

  // SonarQube Ratings
  const maintainabilityScore = Math.max(0, 100 - Math.round(techDebt * 10));
  const maintainabilityGrade =
    maintainabilityScore >= 90 ? 'A' : maintainabilityScore >= 80 ? 'B' : 'C';
  const reliabilityGrade =
    eslintIssues > 20 ? 'B' : eslintIssues > 50 ? 'C' : 'A';
  const securityGrade = securityIssues > 0 ? 'C' : 'A';

  const codeQuality = {
    coverage,
    coverageDiff: 0,
    eslint: eslintIssues,
    eslintDiff,
    security: securityIssues,
    securityDiff: 0,
    techDebt: parseFloat(techDebt.toFixed(1)),
    techDebtDiff,
    maintainabilityScore,
    maintainabilityGrade,
    reliabilityGrade,
    securityGrade,
  };

  // 5. Code Impact metrics
  const [activeCommits, prevCommits, activePRsMerged, prevPRsMerged] =
    await Promise.all([
      AuditLog.countDocuments({
        performer: userId,
        workspaceId,
        action: { $regex: /COMMIT|PR_MERGE/i },
        timestamp: { $gte: activeStart, $lte: activeEnd },
      }),
      AuditLog.countDocuments({
        performer: userId,
        workspaceId,
        action: { $regex: /COMMIT|PR_MERGE/i },
        timestamp: { $gte: prevStart, $lte: prevEnd },
      }),
      AuditLog.countDocuments({
        performer: userId,
        workspaceId,
        action: 'PR_MERGED',
        timestamp: { $gte: activeStart, $lte: activeEnd },
      }),
      AuditLog.countDocuments({
        performer: userId,
        workspaceId,
        action: 'PR_MERGED',
        timestamp: { $gte: prevStart, $lte: prevEnd },
      }),
    ]);

  const commitCount = await AuditLog.countDocuments({
    performer: userId,
    workspaceId,
    action: { $regex: /COMMIT|PR_MERGE/i },
  });
  const prsMerged = await AuditLog.countDocuments({
    performer: userId,
    workspaceId,
    action: 'PR_MERGED',
  });

  const commitsDiff = activeCommits - prevCommits;
  const prsMergedDiff = activePRsMerged - prevPRsMerged;

  const linesChanged = activeCommits * 45;
  const prevLinesChanged = prevCommits * 45;
  const linesChangedDiff = linesChanged - prevLinesChanged;

  const filesChanged = activeCommits * 2;
  const prevFilesChanged = prevCommits * 2;
  const filesChangedDiff = filesChanged - prevFilesChanged;

  const topFilesChanged = [];

  const myCodeImpact = {
    commits: commitCount,
    commitsDiff,
    linesChanged,
    linesChangedDiff,
    filesChanged,
    filesChangedDiff,
    prsMerged: prsMerged,
    prsMergedDiff,
    topFilesChanged,
  };

  // Calculate PR cycle time from completed GitHub tasks assigned to user
  const completedPRs = userTasks.filter(
    (t) => t.source === 'github' && t.status === 'done'
  );

  let avgPRCycleTime = '0.0h';
  let avgPRCycleTimeDiff = '0.0h';

  const activePRs = completedPRs.filter((t) => {
    const date = t.completedAt || t.updatedAt;
    return date >= activeStart && date <= activeEnd;
  });

  const prevPRs = completedPRs.filter((t) => {
    const date = t.completedAt || t.updatedAt;
    return date >= prevStart && date <= prevEnd;
  });

  let activeAvgHours = 0;
  if (activePRs.length > 0) {
    let totalMs = 0;
    activePRs.forEach((t) => {
      const start = t.startedAt || t.createdAt;
      const end = t.completedAt || t.updatedAt;
      totalMs += new Date(end) - new Date(start);
    });
    activeAvgHours = totalMs / activePRs.length / (1000 * 60 * 60);
    avgPRCycleTime = `${activeAvgHours.toFixed(1)}h`;
  } else if (completedPRs.length > 0) {
    let totalMs = 0;
    completedPRs.forEach((t) => {
      const start = t.startedAt || t.createdAt;
      const end = t.completedAt || t.updatedAt;
      totalMs += new Date(end) - new Date(start);
    });
    const overallAvg = totalMs / completedPRs.length / (1000 * 60 * 60);
    avgPRCycleTime = `${overallAvg.toFixed(1)}h`;
  }

  let prevAvgHours = 0;
  if (prevPRs.length > 0) {
    let totalMs = 0;
    prevPRs.forEach((t) => {
      const start = t.startedAt || t.createdAt;
      const end = t.completedAt || t.updatedAt;
      totalMs += new Date(end) - new Date(start);
    });
    prevAvgHours = totalMs / prevPRs.length / (1000 * 60 * 60);
  }

  if (activeAvgHours > 0 && prevAvgHours > 0) {
    const diff = activeAvgHours - prevAvgHours;
    avgPRCycleTimeDiff =
      diff > 0 ? `+${diff.toFixed(1)}h` : `${diff.toFixed(1)}h`;
  }

  // Calculate dynamic feedback score
  const avgFeedbackScore = parseFloat(
    Math.max(
      3.0,
      Math.min(5.0, 5.0 - blockedTasksCount * 0.3 - inReviewTasksCount * 0.1)
    ).toFixed(1)
  );

  // 6. PRs Assigned metrics
  const prOpen = userTasks.filter(
    (t) => t.source === 'github' && t.status !== 'done'
  ).length;
  const prMerged = userTasks.filter(
    (t) => t.source === 'github' && t.status === 'done'
  ).length;
  const prReview = userTasks.filter((t) => t.status === 'in_review').length;
  const pullRequestMetrics = {
    open: prOpen,
    review: prReview,
    merged: prMerged,
  };

  const pullRequestsList = userTasks
    .filter((t) => t.source === 'github')
    .map((t) => ({
      number: t.githubId ? `#${t.githubId}` : 'N/A',
      title: t.title,
      comments: t.comments?.length || 0,
      status:
        t.status === 'done'
          ? 'Merged'
          : t.status === 'in_review'
            ? 'In Review'
            : 'Open',
      link: t.githubUrl || '#',
    }));

  // 7. My Velocity history
  const velocitySpark = [];
  for (const s of pastSprints) {
    const completed = await Task.countDocuments({
      workspaceId,
      assignedUser: userId,
      sprint: s._id,
      status: 'done',
    });
    velocitySpark.push(completed);
  }
  const currentVelocity = velocitySpark[velocitySpark.length - 1] || 0;
  const prevVelocity = velocitySpark[velocitySpark.length - 2] || 0;
  const velocityDiff =
    prevVelocity > 0
      ? Math.round(((currentVelocity - prevVelocity) / prevVelocity) * 100)
      : 0;

  const myVelocity = {
    points: currentVelocity,
    diff: Math.abs(velocityDiff),
    direction: velocityDiff >= 0 ? 'up' : 'down',
    sparkline: velocitySpark.map((v, i) => ({
      sprint: pastSprints[i]?.name || `S${i + 1}`,
      val: v,
    })),
  };

  // 8. Burndown Data
  const burndownData = [];
  if (activeSprint) {
    const sprintStartDate = new Date(activeSprint.startDate);
    const sprintEndDate = new Date(activeSprint.endDate);
    const sprintDays = Math.max(
      1,
      Math.round((sprintEndDate - sprintStartDate) / (1000 * 60 * 60 * 24))
    );
    const sprintTasksForUser = userTasks.filter(
      (t) => t.sprint && t.sprint.toString() === activeSprint._id.toString()
    );
    const sprintTotalPoints = sprintTasksForUser.length;

    for (let i = 0; i <= sprintDays; i++) {
      const currentDate = new Date(sprintStartDate);
      currentDate.setDate(sprintStartDate.getDate() + i);
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
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);
        const doneOnOrBefore = sprintTasksForUser.filter(
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

  // 9. Deployments
  const deployLogs = await AuditLog.find({
    workspaceId,
    action: { $regex: /DEPLOY|RELEASE/i },
  })
    .sort('-timestamp')
    .limit(5)
    .populate('performer', 'name')
    .lean();
  const deployments = deployLogs.map((l) => ({
    environment: l.details?.environment || 'Default',
    version: l.details?.version || 'N/A',
    deployedBy: l.performer?.name || 'System',
    time: formatTimeAgo(l.timestamp),
    status:
      l.action === 'DEPLOY_SUCCESS'
        ? 'Healthy'
        : l.action === 'DEPLOY_FAILURE'
          ? 'Failed'
          : 'Success',
  }));

  // 10. AI Insights
  const aiInsights = [];
  const blockedTasks = userTasks.filter(
    (t) => t.blocked || t.status === 'blocked'
  );
  blockedTasks.forEach((t) => {
    aiInsights.push({
      title: `Blocker on "${t.title}"`,
      text: t.blockedReason
        ? `Reason: ${t.blockedReason}`
        : 'Identify blocked dependencies or credentials to resume progress.',
      type: 'Action',
    });
  });

  const unhealthyServices = services.filter((s) => s.status !== 'healthy');
  unhealthyServices.forEach((s) => {
    aiInsights.push({
      title: `Service Degraded: ${s.name}`,
      text: `Status is currently '${s.status}'. Technical debt score is ${s.technicalDebt?.score || 0}.`,
      type: 'Action',
    });
  });

  if (totalTests > 0 && coverage < 80) {
    aiInsights.push({
      title: 'Increase test coverage',
      text: `Current test coverage is ${coverage}%. Add unit/integration tests to reach the 80% baseline.`,
      type: 'Suggestion',
    });
  }

  if (blockedTasksCount === 0 && (totalTests === 0 || coverage >= 80)) {
    aiInsights.push({
      title: 'Pipeline Healthy',
      text: 'All local services are functional, and there are no blocked tasks assigned to you.',
      type: 'Positive',
    });
  }

  // 11. Upcoming Deadlines
  const upcomingDeadlines = userTasks
    .filter(
      (t) =>
        t.dueDate && t.status !== 'done' && new Date(t.dueDate) > new Date()
    )
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 3)
    .map((t) => ({
      title: t.title,
      date: t.dueDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      daysLeft: Math.ceil(
        (new Date(t.dueDate) - new Date()) / (1000 * 60 * 60 * 24)
      ),
    }));

  // 12. Recent activity logs
  const auditLogs = await AuditLog.find({ performer: userId, workspaceId })
    .sort('-timestamp')
    .limit(8)
    .lean();
  const recentActivity = auditLogs.map((l) => {
    let type = 'commit';
    if (l.action.includes('PR_MERGE')) type = 'pr_merge';
    else if (l.action.includes('DEPLOY')) type = 'deploy';
    else if (l.action.includes('PR_OPEN')) type = 'pr_open';
    else if (l.action.includes('FAIL')) type = 'build_fail';

    return {
      type,
      title: l.action.replace(/_/g, ' '),
      desc: l.details?.message || `Executed ${l.action.replace(/_/g, ' ')}`,
      time: formatTimeAgo(l.timestamp),
    };
  });

  // 13. Learn & Grow
  const learnAndGrow = [];

  // Harmonize naming for all IC dashboards (SWE, JRE, Intern, SE)
  const baseResponse = {
    projects: projects.map((p) => ({ id: p._id, name: p.name, key: p.key })),
    pastSprints: pastSprints.map((s) => ({ id: s._id, name: s.name })),
    sprintName,
    sprintId: activeSprint?._id || null,
    sprintDaysLeft,
    sprintProgress,
    workItemsStatus,
    inProgressTasks,
    inReviewTasks,
    doneTasks,
    pullRequestMetrics,
    pullRequestsList,
    codeHealthScore,
    myVelocity,
    burndownData,
    recentActivity,
    codeQuality,
    myCodeImpact,
    learnAndGrow,
    deployments,
    aiInsights,
    upcomingDeadlines,
    avgPRCycleTime,
    avgPRCycleTimeDiff,
    avgFeedbackScore,

    // Metrics Redundancy
    dayMetrics: {
      ...dayMetrics,
      tasksToday: dayMetrics.myTasks, // for JREDashboard
    },
    assignmentMetrics: {
      // for InternDashboard
      assigned: dayMetrics.myTasks,
      dueToday: dayMetrics.dueToday,
      blocked: dayMetrics.blocked,
    },

    // Task Redundancy
    myTasks,
    guidedTasks: myTasks, // for JREDashboard
    currentTask: myTasks[0] || null, // for InternDashboard

    // Blockers Redundancy
    blockers: myTasks
      .filter((t) => t.blocked)
      .map((t) => ({
        id: t.id,
        issue: t.title,
        contact: t.mentor?.name || 'Lead',
      })),
    stuckGuidance: stuckGuidance.length > 0 ? stuckGuidance : [],
    blockerOptions: [
      { label: 'Requirements Unclear' },
      { label: 'Technical Blocker' },
      { label: 'Environment Issue' },
    ],

    // Progress & Navigation
    progress,
    whatsNext: myTasks.slice(1, 3),
    nextSteps: {
      main: myTasks[1]?.title || 'Next Sprint Planning',
      minor: myTasks[1]
        ? 'Prepare for mission transition'
        : 'Sync with Team Lead',
    },

    ...extraData,
  };

  // 🚀 Senior Engineer Property Injection (Specific Dashboard Aliases)
  if (subRole === 'SENIOR_ENGINEER') {
    const stalePR = await _getStalePR(workspaceId);
    return {
      ...baseResponse,
      executionMetrics: {
        tasksAssigned: dayMetrics.myTasks,
        dueToday: dayMetrics.dueToday,
        blocked: dayMetrics.blocked,
        highPriority: myTasks.filter((t) =>
          ['high', 'urgent'].includes(t.priority)
        ).length,
        pendingReviews: extraData.prStats?.pendingReview || 0,
      },
      workQueue: myTasks,
      myBlockers: baseResponse.blockers.map((b) => ({
        title: b.issue,
        waitingOn: b.contact,
      })),
      prStatus: {
        pendingReviews: extraData.prStats?.pendingReview || 0,
        stalePR,
      },
      myBugs: myTasks.filter(
        (t) =>
          t.title.toLowerCase().includes('bug') ||
          t.title.toLowerCase().includes('defect')
      ),
      activity: {
        commitsToday: activityStats.commitsToday,
        filesChanged: activityStats.filesChanged,
        prsMerged: activityStats.prsMerged,
      },
    };
  }

  return baseResponse;
};

module.exports = {
  getWorkspaceData,
};
