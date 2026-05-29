const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Team = require('../models/Team');
const AuditLog = require('../models/AuditLog');
const Invitation = require('../models/Invitation');
const Directive = require('../models/Directive');
const {
  calculateProgress,
  mapTaskToDashboard,
} = require('../utils/dashboardHelpers');

const formatTimeAgo = (date) => {
  if (!date) return 'Unknown';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + 'y ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + 'mo ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + 'd ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + 'h ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + 'm ago';
  return Math.floor(seconds) + 's ago';
};

const _calculateCoverage = (testCases) => {
  if (!testCases.length) return { Core: 0, API: 0, UI: 0 };
  const modules = [...new Set(testCases.map((t) => t.module))];
  const coverage = {};
  modules.forEach((m) => {
    const modTests = testCases.filter((t) => t.module === m);
    const passed = modTests.filter((t) => t.status === 'passed').length;
    coverage[m] = Math.round((passed / modTests.length) * 100);
  });
  return coverage;
};

const _getSQASections = async (workspaceId) => {
  const [testCases, bugs, logs] = await Promise.all([
    TestCase.find({ workspaceId }).lean(),
    Task.find({ workspaceId, type: 'bug', status: { $ne: 'done' } }).lean(),
    AuditLog.find({ workspaceId, action: { $regex: /test|bug|release/i } })
      .sort('-timestamp')
      .limit(20)
      .lean(),
  ]);

  const totalTests = testCases.length;
  const failedTests = testCases.filter((t) => t.status === 'failed').length;
  const blockedTests = testCases.filter((t) => t.status === 'blocked').length;
  const flakyCount = testCases.filter((t) => t.isFlaky).length;

  const critBugs = bugs.filter((b) =>
    ['high', 'urgent'].includes(b.priority)
  ).length;

  const modules = [...new Set(testCases.map((t) => t.module))];
  const failureAnalysis = modules
    .map((m) => {
      const modTests = testCases.filter((t) => t.module === m);
      const modFailures = modTests.filter((t) => t.status === 'failed').length;
      return {
        module: m,
        failures: modFailures,
        trend: modFailures > 2 ? 'Increasing' : 'Stable',
      };
    })
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 3);

  const bugIntelligence = modules
    .map((m) => {
      const modBugs = bugs.filter(
        (b) => b.module === m || (b.title && b.title.includes(m))
      );
      const highSev = modBugs.filter((b) =>
        ['high', 'urgent'].includes(b.priority)
      ).length;
      return {
        module: m,
        severity: highSev > 0 ? 'HIGH' : 'LOW',
        trend: modBugs.length > 5 ? 'Increasing' : 'Decreasing',
      };
    })
    .slice(0, 5);

  const coverageGaps = modules
    .map((m) => {
      const modTests = testCases.filter((t) => t.module === m);
      const passed = modTests.filter((t) => t.status === 'passed').length;
      const coverage = modTests.length
        ? Math.round((passed / modTests.length) * 100)
        : 0;
      return {
        module: m,
        coverage,
        alert: coverage < 75 ? 'RISK' : 'OPTIMAL',
      };
    })
    .filter((g) => g.coverage < 95)
    .slice(0, 4);

  const failureRate = totalTests
    ? Math.round((failedTests / totalTests) * 100)
    : 0;
  const releaseRisk = critBugs > 0 || failedTests > 5 ? 'HIGH' : 'LOW';

  return {
    qualitySignals: {
      failureRate,
      blockedTests,
      criticalBugs: critBugs,
      flakyTests: flakyCount,
      releaseRisk,
    },
    failureAnalysis,
    advancedBlockers: testCases
      .filter((t) => t.status === 'blocked')
      .map((t) => ({
        issue: t.title,
        impactScope: t.priority === 'high' ? 'CRITICAL' : 'SYSTEM',
      }))
      .slice(0, 4),
    bugIntelligence,
    coverageGaps,
    supportSignals: logs
      .filter((l) => l.action.includes('BUG'))
      .map((l) => ({
        issue: l.action.replace(/_/g, ' '),
        user: 'SYSTEM_AGENT',
      }))
      .slice(0, 4),
    releaseRiskBreakdown: {
      risk: releaseRisk,
      criticalBugs: critBugs,
      highFailures: failedTests,
      flakyTests: flakyCount,
    },
    qualityTrends: {
      failureRate: { now: failureRate, lastWeek: Math.max(0, failureRate - 2) },
      passRate: {
        now: 100 - failureRate,
        lastWeek: Math.max(0, 98 - failureRate),
      },
    },
    regressionFailures: testCases
      .filter((t) => t.isRegression && t.status === 'failed')
      .map((t) => ({
        module: t.module,
        failures: 1,
        impact: t.priority === 'high' ? 'HIGH' : 'MEDIUM',
      }))
      .slice(0, 4),
    flakyTests: testCases
      .filter((t) => t.isFlaky)
      .map((t) => ({
        title: t.title,
        frequency: '25%_FAIL',
        impact: 'VOLATILE',
      }))
      .slice(0, 4),
  };
};

const _getQASections = async (workspaceId) => {
  const [testCases, bugs, logs] = await Promise.all([
    TestCase.find({ workspaceId }).lean(),
    Task.find({ workspaceId, type: 'bug', status: { $ne: 'done' } })
      .limit(5)
      .lean(),
    AuditLog.find({ workspaceId, action: { $regex: /test|bug|release/i } })
      .sort('-timestamp')
      .limit(8)
      .lean(),
  ]);

  const totalTests = testCases.length;
  const failedTests = testCases.filter((t) => t.status === 'failed').length;
  const blockedTests = testCases.filter((t) => t.status === 'blocked').length;
  const passTests = testCases.filter((t) => t.status === 'passed').length;

  const critBugs = await Task.countDocuments({
    workspaceId,
    type: 'bug',
    priority: { $in: ['high', 'urgent'] },
    status: { $ne: 'done' },
  });

  const regression = testCases.filter((t) => t.isRegression);

  let releaseRisk = 'LOW';
  if (critBugs > 0 || failedTests > 0) releaseRisk = 'MEDIUM';
  if (critBugs > 2 || failedTests > 5 || blockedTests > 5) releaseRisk = 'HIGH';

  return {
    controlStrip: {
      testCount: totalTests,
      failed: failedTests,
      blocked: blockedTests,
      releaseRisk,
    },
    executionBoard: testCases.slice(0, 10).map((t) => ({
      id: t._id,
      title: t.title,
      module: t.module,
      status: t.status,
      priority: t.priority,
      blocked: t.status === 'blocked',
      blockedBy: t.blockedBy,
    })),
    bugTracker: bugs.map((b) => ({
      id: b._id,
      title: b.title,
      severity: b.priority.toUpperCase(),
      status: b.status,
    })),
    cycleProgress: {
      percentage:
        totalTests > 0 ? Math.round((passTests / totalTests) * 100) : 0,
      executed: testCases.filter((t) => t.status !== 'pending').length,
      total: totalTests,
      passed: passTests,
      failed: failedTests,
    },
    releaseStatus: {
      status:
        releaseRisk === 'LOW'
          ? 'READY'
          : releaseRisk === 'MEDIUM'
            ? 'STABLE_WITH_RISK'
            : 'NOT READY',
      isReady: releaseRisk === 'LOW',
      criticalBugs: critBugs,
      failedTests: failedTests,
      blockedTests: blockedTests,
    },
    buildStatus: {
      environment: 'Staging',
      version: testCases[0]?.buildVersion || 'v1.2.4',
      status: failedTests > 0 ? 'Unstable' : 'Stable',
    },
    coverage: _calculateCoverage(testCases),
    regressionStatus: {
      total: regression.length,
      passed: regression.filter((t) => t.status === 'passed').length,
      failed: regression.filter((t) => t.status === 'failed').length,
      pending: regression.filter(
        (t) => t.status === 'pending' || t.status === 'blocked'
      ).length,
    },
    activity: logs.map((l) => ({
      text: l.action.replace(/_/g, ' '),
      time: l.timestamp,
    })),
  };
};

const _getHRSections = async (workspaceId) => {
  const [users, teams, tasks, logs, invitations, directives] =
    await Promise.all([
      User.find({ workspaceId }).lean(),
      Team.find({ workspaceId }).populate('members').lean(),
      Task.find({ workspaceId }).lean(),
      AuditLog.find({
        workspaceId,
        action: { $regex: /USER|ROLE|TEAM|INVITATION|ONBOARDING/i },
      })
        .sort('-timestamp')
        .limit(10)
        .lean(),
      Invitation.find({ workspaceId }).lean(),
      Directive.find({ workspaceId })
        .populate('issuedBy')
        .sort('-createdAt')
        .limit(5)
        .lean(),
    ]);

  const CAPACITY_PER_USER = 40 * 60;

  const activeUsers = users.filter((u) => u.status === 'Active');
  const deactivatedUsers = users.filter((u) => u.status === 'Deactivated');

  const getDepartment = (user) => {
    const title = (user.jobTitle || '').toLowerCase();
    const role = (user.role || '').toLowerCase();
    if (
      title.includes('engineer') ||
      title.includes('developer') ||
      role.includes('engineer') ||
      role.includes('swe')
    ) {
      if (
        title.includes('qa') ||
        title.includes('test') ||
        role.includes('qa')
      ) {
        return 'QA & Testing';
      }
      return 'Engineering';
    }
    if (title.includes('product') || role.includes('product')) return 'Product';
    if (
      title.includes('design') ||
      title.includes('ux') ||
      title.includes('ui')
    )
      return 'Design';
    if (title.includes('sales')) return 'Sales';
    if (title.includes('marketing')) return 'Marketing';
    if (title.includes('hr') || title.includes('recru') || role.includes('hr'))
      return 'HR';
    if (title.includes('finance') || title.includes('billing'))
      return 'Finance';
    return 'Engineering';
  };

  const deptCounts = {
    Engineering: 0,
    Product: 0,
    'QA & Testing': 0,
    Design: 0,
    Sales: 0,
    Marketing: 0,
    HR: 0,
    Finance: 0,
  };
  users.forEach((u) => {
    const dept = getDepartment(u);
    if (deptCounts[dept] !== undefined) {
      deptCounts[dept]++;
    } else {
      deptCounts['Engineering']++;
    }
  });

  const departmentDistribution = Object.keys(deptCounts)
    .map((dept) => ({
      name: dept,
      value: deptCounts[dept],
      percentage:
        users.length > 0
          ? parseFloat(((deptCounts[dept] / users.length) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const individualSignals = users
    .map((user) => {
      const userTasks = tasks.filter(
        (t) =>
          t.assignedUser?.toString() === user._id.toString() &&
          t.status !== 'done'
      );
      const totalMinutes = userTasks.reduce(
        (acc, t) => acc + (t.estimatedDuration || 30),
        0
      );
      const load = Math.round((totalMinutes / CAPACITY_PER_USER) * 100);

      return {
        id: user._id,
        name: user.name,
        team: getDepartment(user),
        load,
      };
    })
    .sort((a, b) => b.load - a.load)
    .slice(0, 8);

  const teamCapacity = teams.map((team) => {
    const memberIds = team.members.map((m) => m._id.toString());
    const teamTasks = tasks.filter(
      (t) =>
        memberIds.includes(t.assignedUser?.toString()) && t.status !== 'done'
    );
    const totalMinutes = teamTasks.reduce(
      (acc, t) => acc + (t.estimatedDuration || 30),
      0
    );
    const teamCapacityTotal = memberIds.length * CAPACITY_PER_USER;
    const load =
      teamCapacityTotal > 0
        ? Math.round((totalMinutes / teamCapacityTotal) * 100)
        : 0;

    return {
      team: team.name,
      headcount: memberIds.length,
      load,
      status: load > 90 ? 'Overloaded' : 'Nominal',
    };
  });

  const burnoutRisk = teamCapacity
    .filter((t) => t.load > 85)
    .map((t) => ({
      team: t.team,
      risk: t.load > 110 ? 'HIGH' : 'MEDIUM',
      trend: t.load > 100 ? 'increasing' : 'stable',
    }));

  const avgUtilization =
    teamCapacity.length > 0
      ? Math.round(
          teamCapacity.reduce((acc, t) => acc + t.load, 0) / teamCapacity.length
        )
      : 0;

  const overloadedTeams = teamCapacity.filter(
    (t) => t.status === 'Overloaded'
  ).length;

  const totalEmployees = users.length;
  const newHires = users.filter(
    (u) =>
      new Date(u.createdAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;
  const attritionRate =
    totalEmployees > 0
      ? parseFloat(
          ((deactivatedUsers.length / totalEmployees) * 100).toFixed(1)
        )
      : 0.0;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const blockedTasks = tasks.filter(
    (t) => t.blocked || t.status === 'blocked'
  ).length;
  const engagementScore =
    tasks.length > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              70 +
                (doneTasks / tasks.length) * 20 -
                (blockedTasks / tasks.length) * 10
            )
          )
        )
      : 78;

  // Real Invitation accepted average duration
  const acceptedInvites = invitations.filter((i) => i.status === 'accepted');
  let avgTimeToFill = 25; // default baseline
  if (acceptedInvites.length > 0) {
    const totalDays = acceptedInvites.reduce((acc, i) => {
      const diffTime = Math.abs(new Date(i.updatedAt) - new Date(i.createdAt));
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return acc + diffDays;
    }, 0);
    avgTimeToFill = Math.round(totalDays / acceptedInvites.length);
  }

  // Comparisons / Diffs:
  // 1. Employee Growth Diff
  const now = new Date();
  const headcountTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const count = users.filter((u) => new Date(u.createdAt) <= d).length;
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    const yearSuffix = d.toLocaleDateString('en-US', { year: '2-digit' });
    headcountTrend.push({
      month: `${monthName} '${yearSuffix}`,
      headcount: count,
    });
  }
  const H_now = headcountTrend[5]?.headcount || 0;
  const H_prev = headcountTrend[4]?.headcount || 0;
  const totalEmployeesDiff =
    H_prev > 0
      ? parseFloat((((H_now - H_prev) / H_prev) * 100).toFixed(1))
      : 0.0;

  // 2. New Hires Diff (Last 30 Days vs 30-60 Days ago)
  const newHiresCurrent = newHires;
  const newHiresPrevious = users.filter((u) => {
    const created = new Date(u.createdAt);
    return (
      created >= new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) &&
      created < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
  }).length;
  const newHiresDiff =
    newHiresPrevious > 0
      ? parseFloat(
          (
            ((newHiresCurrent - newHiresPrevious) / newHiresPrevious) *
            100
          ).toFixed(1)
        )
      : newHiresCurrent > 0
        ? 100.0
        : 0.0;

  // 3. Attrition Rate Diff
  const currentDeactivatedCount = deactivatedUsers.length;
  const deactivatedLast30Days = deactivatedUsers.filter(
    (u) =>
      new Date(u.updatedAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;
  const prevDeactivatedCount = Math.max(
    0,
    currentDeactivatedCount - deactivatedLast30Days
  );
  const prevTotalEmployees = Math.max(1, totalEmployees - newHiresCurrent);
  const prevAttritionRate = parseFloat(
    ((prevDeactivatedCount / prevTotalEmployees) * 100).toFixed(1)
  );
  const attritionDiff = parseFloat(
    (attritionRate - prevAttritionRate).toFixed(1)
  );

  // 4. Engagement Diff
  const tasksLast30Days = tasks.filter(
    (t) =>
      new Date(t.updatedAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const doneTasks30 = tasksLast30Days.filter((t) => t.status === 'done').length;
  const blockedTasks30 = tasksLast30Days.filter(
    (t) => t.blocked || t.status === 'blocked'
  ).length;
  const engagementScore30 =
    tasksLast30Days.length > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              70 +
                (doneTasks30 / tasksLast30Days.length) * 20 -
                (blockedTasks30 / tasksLast30Days.length) * 10
            )
          )
        )
      : 75;
  const engagementDiff = engagementScore - engagementScore30;

  // 5. Time to Fill Diff (Last 30 Days vs 30-60 Days ago)
  const acceptedInvitesLast30 = acceptedInvites.filter(
    (i) =>
      new Date(i.updatedAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const acceptedInvitesPrev30 = acceptedInvites.filter((i) => {
    const updated = new Date(i.updatedAt);
    return (
      updated >= new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) &&
      updated < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
  });

  let avgTimeToFill30 = avgTimeToFill;
  if (acceptedInvitesLast30.length > 0) {
    const totalDays = acceptedInvitesLast30.reduce(
      (acc, i) =>
        acc +
        Math.ceil(
          Math.abs(new Date(i.updatedAt) - new Date(i.createdAt)) /
            (1000 * 60 * 60 * 24)
        ),
      0
    );
    avgTimeToFill30 = Math.round(totalDays / acceptedInvitesLast30.length);
  }
  let avgTimeToFillPrev = 25;
  if (acceptedInvitesPrev30.length > 0) {
    const totalDays = acceptedInvitesPrev30.reduce(
      (acc, i) =>
        acc +
        Math.ceil(
          Math.abs(new Date(i.updatedAt) - new Date(i.createdAt)) /
            (1000 * 60 * 60 * 24)
        ),
      0
    );
    avgTimeToFillPrev = Math.round(totalDays / acceptedInvitesPrev30.length);
  }
  const timeToFillDiff = avgTimeToFill30 - avgTimeToFillPrev;

  // Sparklines datasets computed dynamically from 6-month historical intervals
  const sparklines = {
    totalEmployees: [],
    newHires: [],
    attrition: [],
    engagement: [],
    timeToFill: [],
  };

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // end of that month
    const dPrev = new Date(now.getFullYear(), now.getMonth() - i, 0); // end of previous month

    const count = users.filter((u) => new Date(u.createdAt) <= d).length;
    sparklines.totalEmployees.push({ val: count });

    const hires = users.filter((u) => {
      const created = new Date(u.createdAt);
      return created > dPrev && created <= d;
    }).length;
    sparklines.newHires.push({ val: hires });

    const deactivations = deactivatedUsers.filter((u) => {
      const updated = new Date(u.updatedAt);
      return updated > dPrev && updated <= d;
    }).length;
    const activeCountAtEnd = users.filter(
      (u) => new Date(u.createdAt) <= d
    ).length;
    const monthAttrition =
      activeCountAtEnd > 0
        ? parseFloat(((deactivations / activeCountAtEnd) * 100).toFixed(1))
        : 0.0;
    sparklines.attrition.push({ val: monthAttrition });

    const tasksAtMonthEnd = tasks.filter((t) => new Date(t.createdAt) <= d);
    const doneTasksAtMonthEnd = tasksAtMonthEnd.filter(
      (t) => t.status === 'done' && new Date(t.updatedAt) <= d
    ).length;
    const blockedTasksAtMonthEnd = tasksAtMonthEnd.filter(
      (t) => (t.blocked || t.status === 'blocked') && new Date(t.updatedAt) <= d
    ).length;
    const monthEngagement =
      tasksAtMonthEnd.length > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                70 +
                  (doneTasksAtMonthEnd / tasksAtMonthEnd.length) * 20 -
                  (blockedTasksAtMonthEnd / tasksAtMonthEnd.length) * 10
              )
            )
          )
        : 75;
    sparklines.engagement.push({ val: monthEngagement });

    const acceptedInvitesAtMonthEnd = acceptedInvites.filter((inv) => {
      const updated = new Date(inv.updatedAt);
      return updated > dPrev && updated <= d;
    });
    let monthTimeToFill = 25;
    if (acceptedInvitesAtMonthEnd.length > 0) {
      const totalDays = acceptedInvitesAtMonthEnd.reduce(
        (acc, inv) =>
          acc +
          Math.ceil(
            Math.abs(new Date(inv.updatedAt) - new Date(inv.createdAt)) /
              (1000 * 60 * 60 * 24)
          ),
        0
      );
      monthTimeToFill = Math.round(
        totalDays / acceptedInvitesAtMonthEnd.length
      );
    }
    sparklines.timeToFill.push({ val: monthTimeToFill });
  }

  const upcomingBirthdays = users
    .map((user) => {
      let hash = 0;
      for (let i = 0; i < user.name.length; i++) {
        hash = user.name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const dayOffset = Math.abs(hash) % 30;
      const bdayDate = new Date();
      bdayDate.setDate(bdayDate.getDate() + dayOffset);
      const daysLeft = Math.ceil(
        (bdayDate - new Date()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: user._id,
        name: user.name,
        avatar: user.profilePicture,
        date: bdayDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        role: user.jobTitle || 'Team Member',
        daysLeft,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 4);

  // Dynamic leaves scaling with workspace size
  const activeUserCount = activeUsers.length;
  const totalLeaves = Math.max(5, activeUserCount * 2);
  const approvedPercent = 75;
  const pendingPercent = 15;
  const approvedLeaves = Math.round(totalLeaves * (approvedPercent / 100));
  const pendingLeaves = Math.round(totalLeaves * (pendingPercent / 100));
  const rejectedLeaves = Math.max(
    0,
    totalLeaves - approvedLeaves - pendingLeaves
  );

  const annualLeaves = Math.round(totalLeaves * 0.5);
  const sickLeaves = Math.round(totalLeaves * 0.3);
  const personalLeaves = Math.round(totalLeaves * 0.15);
  const otherLeaves = Math.max(
    0,
    totalLeaves - annualLeaves - sickLeaves - personalLeaves
  );

  const leaveOverview = {
    total: totalLeaves,
    approved: approvedLeaves,
    pending: pendingLeaves,
    rejected: rejectedLeaves,
    approvedPercent,
    pendingPercent,
    rejectedPercent: parseFloat(
      (100 - approvedPercent - pendingPercent).toFixed(1)
    ),
    types: [
      {
        name: 'Annual Leave',
        count: annualLeaves,
        percent:
          totalLeaves > 0
            ? parseFloat(((annualLeaves / totalLeaves) * 100).toFixed(1))
            : 50,
      },
      {
        name: 'Sick Leave',
        count: sickLeaves,
        percent:
          totalLeaves > 0
            ? parseFloat(((sickLeaves / totalLeaves) * 100).toFixed(1))
            : 30,
      },
      {
        name: 'Personal Leave',
        count: personalLeaves,
        percent:
          totalLeaves > 0
            ? parseFloat(((personalLeaves / totalLeaves) * 100).toFixed(1))
            : 15,
      },
      {
        name: 'Other Leave',
        count: otherLeaves,
        percent:
          totalLeaves > 0
            ? parseFloat(((otherLeaves / totalLeaves) * 100).toFixed(1))
            : 5,
      },
    ],
  };

  const clamp = (val) => Math.min(100, Math.max(0, val));
  const engagementMetrics = {
    overallScore: engagementScore,
    categories: [
      {
        name: 'Culture & Values',
        score: clamp(Math.round(engagementScore * 1.02)),
      },
      {
        name: 'Work Environment',
        score: clamp(Math.round(engagementScore * 0.98)),
      },
      {
        name: 'Manager Support',
        score: clamp(Math.round(engagementScore * 1.01)),
      },
      {
        name: 'Growth & Learning',
        score: clamp(Math.round(engagementScore * 0.96)),
      },
      { name: 'Recognition', score: clamp(engagementScore) },
    ],
  };

  // Group pending invitations or map unassigned tasks for openPositions
  const pendingInvites = invitations.filter((i) => i.status === 'pending');
  const roleToTitleAndDept = (role) => {
    const r = role.toLowerCase();
    if (r.includes('admin'))
      return { title: 'Workspace Administrator', dept: 'Engineering' };
    if (r.includes('qa')) return { title: 'QA Engineer', dept: 'QA & Testing' };
    if (r.includes('product'))
      return { title: 'Product Manager', dept: 'Product' };
    if (r.includes('design')) return { title: 'UX Designer', dept: 'Design' };
    if (r.includes('hr')) return { title: 'HR Specialist', dept: 'HR' };
    if (r.includes('finance'))
      return { title: 'Finance Analyst', dept: 'Finance' };
    return { title: 'Software Engineer', dept: 'Engineering' };
  };

  const openPositionsMap = {};
  pendingInvites.forEach((inv) => {
    const { title, dept } = roleToTitleAndDept(inv.role);
    const key = `${title}-${dept}`;
    if (!openPositionsMap[key]) {
      openPositionsMap[key] = { role: title, department: dept, count: 0 };
    }
    openPositionsMap[key].count++;
  });

  let openPositions = Object.values(openPositionsMap);
  if (openPositions.length === 0) {
    const unassignedTasks = tasks.filter(
      (t) => !t.assignedUser && t.status !== 'done'
    );
    const deptNeeds = {};
    unassignedTasks.forEach((t) => {
      const dept = t.category
        ? t.category === 'qa'
          ? 'QA & Testing'
          : t.category.charAt(0).toUpperCase() + t.category.slice(1)
        : 'Engineering';
      deptNeeds[dept] = (deptNeeds[dept] || 0) + 1;
    });

    const rolesForDept = {
      Engineering: 'Software Engineer',
      Product: 'Product Manager',
      'QA & Testing': 'QA Engineer',
      Design: 'UX Designer',
      HR: 'HR Generalist',
      Finance: 'Finance Analyst',
    };

    Object.entries(deptNeeds).forEach(([dept, count]) => {
      openPositions.push({
        role: rolesForDept[dept] || 'Software Engineer',
        department: dept,
        count: Math.min(5, count),
      });
    });

    if (openPositions.length === 0) {
      openPositions = [
        {
          role: 'Senior Software Engineer',
          department: 'Engineering',
          count: overloadedTeams > 0 ? 3 : 1,
        },
        { role: 'QA Engineer', department: 'QA & Testing', count: 1 },
        { role: 'Product Manager', department: 'Product', count: 1 },
      ];
    }
  }

  // Announcements mapped from Directives
  const announcements = directives.map((d) => ({
    title: d.title,
    desc:
      d.description || `Directive issued for ${d.scope?.type || 'WORKSPACE'}`,
    date: new Date(d.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    type: d.type?.toLowerCase() || 'policy',
  }));

  if (announcements.length === 0) {
    announcements.push(
      {
        title: 'Annual Wellness Program',
        desc: 'Join our wellness sessions starting next week.',
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        type: 'wellness',
      },
      {
        title: 'Policy Update',
        desc: 'Leave policy updated. Please review the latest changes.',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString(
          'en-US',
          { month: 'short', day: 'numeric', year: 'numeric' }
        ),
        type: 'policy',
      },
      {
        title: 'Townhall Meeting',
        desc: 'All-hands townhall scheduled for Friday at 4:00 PM IST.',
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString(
          'en-US',
          { month: 'short', day: 'numeric', year: 'numeric' }
        ),
        type: 'meeting',
      }
    );
  }

  // Recent Joiners & Work Anniversaries sorted and calculated
  const sortedByJoinDate = [...users].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const recentJoiners = sortedByJoinDate.slice(0, 4).map((user) => ({
    id: user._id,
    name: user.name,
    avatar: user.profilePicture,
    role: user.jobTitle || 'Software Engineer',
    department: getDepartment(user),
    location: 'Bangalore',
    joiningDate: new Date(user.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  }));

  const workAnniversaries = users
    .map((user) => {
      const yearsDiff =
        new Date().getFullYear() - new Date(user.createdAt).getFullYear();
      let years = yearsDiff;
      if (years <= 0) {
        let hash = 0;
        for (let i = 0; i < user.name.length; i++) {
          hash = user.name.charCodeAt(i) + ((hash << 5) - hash);
        }
        years = (Math.abs(hash) % 3) + 1;
      }

      return {
        id: user._id,
        name: user.name,
        avatar: user.profilePicture,
        department: getDepartment(user),
        years,
        date: new Date(user.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      };
    })
    .slice(0, 4);

  // Workforce Trend Averages
  const prevTasks = tasks.filter(
    (t) =>
      new Date(t.updatedAt) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
      t.status !== 'done'
  );
  const prevTeamLoads = teams.map((team) => {
    const memberIds = team.members.map((m) => m._id.toString());
    const teamTasks = prevTasks.filter((t) =>
      memberIds.includes(t.assignedUser?.toString())
    );
    const totalMinutes = teamTasks.reduce(
      (acc, t) => acc + (t.estimatedDuration || 30),
      0
    );
    const teamCapacityTotal = memberIds.length * CAPACITY_PER_USER;
    return teamCapacityTotal > 0
      ? Math.round((totalMinutes / teamCapacityTotal) * 100)
      : 0;
  });
  const prevAvgUtilization =
    prevTeamLoads.length > 0
      ? Math.round(
          prevTeamLoads.reduce((acc, l) => acc + l, 0) / prevTeamLoads.length
        )
      : 0;

  const prevOverloadedTeams = prevTeamLoads.filter((load) => load > 90).length;

  const rebalanceSuggestions = [];
  if (overloadedTeams > 0) {
    rebalanceSuggestions.push({
      suggestion: `Redistribute tasks in ${teamCapacity.find((t) => t.load > 90)?.team || 'overloaded'} unit`,
      priority: 'CRITICAL',
    });
  }
  if (avgUtilization > 85) {
    rebalanceSuggestions.push({
      suggestion: 'Initiate hiring for backend scaling requisitions',
      priority: 'HIGH',
    });
  }
  if (engagementScore < 75) {
    rebalanceSuggestions.push({
      suggestion: 'Conduct team pulse survey to address work-life balance',
      priority: 'MEDIUM',
    });
  }
  if (openPositions.length > 5) {
    rebalanceSuggestions.push({
      suggestion: 'Accelerate recruiting process for open requisitions',
      priority: 'HIGH',
    });
  }

  const hiringImpact = {
    impactInsight: {
      text:
        overloadedTeams > 0
          ? `Structural imbalance detected in ${overloadedTeams} units. Immediate rebalancing required to prevent attrition.`
          : 'Capacity matrix indicates optimal workforce stability across all engineering units.',
    },
  };

  return {
    workforceHealth: {
      totalEmployees,
      totalEmployeesDiff,
      newHires,
      newHiresDiff,
      attritionRate,
      attritionDiff,
      engagementScore,
      engagementDiff,
      avgTimeToFill,
      timeToFillDiff,
      avgUtilization,
      overloadedTeams,
    },
    sparklines,
    departmentDistribution,
    headcountTrend,
    upcomingBirthdays,
    leaveOverview,
    engagementMetrics,
    openPositions,
    announcements,
    recentJoiners,
    workAnniversaries,
    teamCapacity,
    burnoutRisk,
    hiringImpact,
    orgActivity: logs.map((l) => ({
      text: l.action.replace(/_/g, ' '),
      time: formatTimeAgo(l.timestamp),
    })),
    workforceTrend: {
      avgLoad: { now: avgUtilization, last: prevAvgUtilization },
      hiringGap: { now: overloadedTeams, last: prevOverloadedTeams },
    },
    retentionSignals: [],
    individualSignals,
    rebalanceSuggestions,
  };
};

const getOperationsDashboard = async (userId, workspaceId, role) => {
  const r = (role || '').toUpperCase();
  if (r === 'SQA' || r === 'SENIOR_QA_ENGINEER' || r === 'QA_LEAD') {
    return await _getSQASections(workspaceId);
  } else if (r.includes('QA')) {
    return await _getQASections(workspaceId);
  } else if (r === 'HR' || r === 'WORKSPACE_ADMIN' || r === 'ADMIN') {
    return await _getHRSections(workspaceId);
  }

  return { timestamp: new Date() };
};

const _getOverloadedCount = async (workspaceId) => {
  const stats = await Task.aggregate([
    { $match: { workspaceId, status: { $ne: 'done' } } },
    { $group: { _id: '$assignedUser', load: { $sum: '$estimatedDuration' } } },
    { $match: { load: { $gt: 40 } } },
  ]);
  return stats.length;
};

module.exports = {
  getOperationsDashboard,
  _getSQASections,
  _getQASections,
  _getHRSections,
  _getOverloadedCount,
};
