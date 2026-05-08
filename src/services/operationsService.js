const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Team = require('../models/Team');
const AuditLog = require('../models/AuditLog');
const { calculateProgress, mapTaskToDashboard } = require('../utils/dashboardHelpers');

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
  if (!testCases.length) return { 'Core': 0, 'API': 0, 'UI': 0 };
  const modules = [...new Set(testCases.map(t => t.module))];
  const coverage = {};
  modules.forEach(m => {
    const modTests = testCases.filter(t => t.module === m);
    const passed = modTests.filter(t => t.status === 'passed').length;
    coverage[m] = Math.round((passed / modTests.length) * 100);
  });
  return coverage;
};

const _getSQASections = async (workspaceId) => {
  const [testCases, bugs, logs] = await Promise.all([
    TestCase.find({ workspaceId }).lean(),
    Task.find({ workspaceId, type: 'bug', status: { $ne: 'done' } }).lean(),
    AuditLog.find({ workspaceId, action: { $regex: /test|bug|release/i } }).sort('-timestamp').limit(20).lean()
  ]);

  const totalTests = testCases.length;
  const failedTests = testCases.filter(t => t.status === 'failed').length;
  const blockedTests = testCases.filter(t => t.status === 'blocked').length;
  const flakyCount = testCases.filter(t => t.isFlaky).length;
  
  const critBugs = bugs.filter(b => ['high', 'urgent'].includes(b.priority)).length;
  
  const modules = [...new Set(testCases.map(t => t.module))];
  const failureAnalysis = modules.map(m => {
    const modTests = testCases.filter(t => t.module === m);
    const modFailures = modTests.filter(t => t.status === 'failed').length;
    return {
      module: m,
      failures: modFailures,
      trend: modFailures > 2 ? 'Increasing' : 'Stable'
    };
  }).sort((a, b) => b.failures - a.failures).slice(0, 3);

  const bugIntelligence = modules.map(m => {
    const modBugs = bugs.filter(b => b.module === m || (b.title && b.title.includes(m)));
    const highSev = modBugs.filter(b => ['high', 'urgent'].includes(b.priority)).length;
    return {
      module: m,
      severity: highSev > 0 ? 'HIGH' : 'LOW',
      trend: modBugs.length > 5 ? 'Increasing' : 'Decreasing'
    };
  }).slice(0, 5);

  const coverageGaps = modules.map(m => {
    const modTests = testCases.filter(t => t.module === m);
    const passed = modTests.filter(t => t.status === 'passed').length;
    const coverage = modTests.length ? Math.round((passed / modTests.length) * 100) : 0;
    return {
      module: m,
      coverage,
      alert: coverage < 75 ? 'RISK' : 'OPTIMAL'
    };
  }).filter(g => g.coverage < 95).slice(0, 4);

  const failureRate = totalTests ? Math.round((failedTests / totalTests) * 100) : 0;
  const releaseRisk = (critBugs > 0 || failedTests > 5) ? 'HIGH' : 'LOW';

  return {
    qualitySignals: {
      failureRate,
      blockedTests,
      criticalBugs: critBugs,
      flakyTests: flakyCount,
      releaseRisk
    },
    failureAnalysis,
    advancedBlockers: testCases.filter(t => t.status === 'blocked').map(t => ({
      issue: t.title,
      impactScope: t.priority === 'high' ? 'CRITICAL' : 'SYSTEM'
    })).slice(0, 4),
    bugIntelligence,
    coverageGaps,
    supportSignals: logs.filter(l => l.action.includes('BUG')).map(l => ({
      issue: l.action.replace(/_/g, ' '),
      user: 'SYSTEM_AGENT'
    })).slice(0, 4),
    releaseRiskBreakdown: {
      risk: releaseRisk,
      criticalBugs: critBugs,
      highFailures: failedTests,
      flakyTests: flakyCount
    },
    qualityTrends: {
      failureRate: { now: failureRate, lastWeek: Math.max(0, failureRate - 2) },
      passRate: { now: 100 - failureRate, lastWeek: Math.max(0, 98 - failureRate) }
    },
    regressionFailures: testCases.filter(t => t.isRegression && t.status === 'failed').map(t => ({
      module: t.module,
      failures: 1,
      impact: t.priority === 'high' ? 'HIGH' : 'MEDIUM'
    })).slice(0, 4),
    flakyTests: testCases.filter(t => t.isFlaky).map(t => ({
      title: t.title,
      frequency: '25%_FAIL',
      impact: 'VOLATILE'
    })).slice(0, 4)
  };
};

const _getQASections = async (workspaceId) => {
  const [testCases, bugs, logs] = await Promise.all([
    TestCase.find({ workspaceId }).lean(),
    Task.find({ workspaceId, type: 'bug', status: { $ne: 'done' } }).limit(5).lean(),
    AuditLog.find({ workspaceId, action: { $regex: /test|bug|release/i } }).sort('-timestamp').limit(8).lean()
  ]);

  const totalTests = testCases.length;
  const failedTests = testCases.filter(t => t.status === 'failed').length;
  const blockedTests = testCases.filter(t => t.status === 'blocked').length;
  const passTests = testCases.filter(t => t.status === 'passed').length;
  
  const critBugs = await Task.countDocuments({ 
    workspaceId, 
    type: 'bug', 
    priority: { $in: ['high', 'urgent'] }, 
    status: { $ne: 'done' } 
  });

  const regression = testCases.filter(t => t.isRegression);

  let releaseRisk = 'LOW';
  if (critBugs > 0 || failedTests > 0) releaseRisk = 'MEDIUM';
  if (critBugs > 2 || failedTests > 5 || blockedTests > 5) releaseRisk = 'HIGH';

  return {
    controlStrip: {
      testCount: totalTests,
      failed: failedTests,
      blocked: blockedTests,
      releaseRisk
    },
    executionBoard: testCases.slice(0, 10).map(t => ({
      id: t._id,
      title: t.title,
      module: t.module,
      status: t.status,
      priority: t.priority,
      blocked: t.status === 'blocked',
      blockedBy: t.blockedBy
    })),
    bugTracker: bugs.map(b => ({
      id: b._id,
      title: b.title,
      severity: b.priority.toUpperCase(),
      status: b.status
    })),
    cycleProgress: {
       percentage: totalTests > 0 ? Math.round((passTests / totalTests) * 100) : 0,
       executed: testCases.filter(t => t.status !== 'pending').length,
       total: totalTests,
       passed: passTests,
       failed: failedTests
    },
    releaseStatus: {
      status: releaseRisk === 'LOW' ? 'READY' : (releaseRisk === 'MEDIUM' ? 'STABLE_WITH_RISK' : 'NOT READY'),
      isReady: releaseRisk === 'LOW',
      criticalBugs: critBugs,
      failedTests: failedTests,
      blockedTests: blockedTests
    },
    buildStatus: { 
      environment: 'Staging', 
      version: testCases[0]?.buildVersion || 'v1.2.4', 
      status: failedTests > 0 ? 'Unstable' : 'Stable' 
    },
    coverage: _calculateCoverage(testCases),
    regressionStatus: {
      total: regression.length,
      passed: regression.filter(t => t.status === 'passed').length,
      failed: regression.filter(t => t.status === 'failed').length,
      pending: regression.filter(t => t.status === 'pending' || t.status === 'blocked').length
    },
    activity: logs.map(l => ({
      text: l.action.replace(/_/g, ' '),
      time: l.timestamp
    }))
  };
};

const _getHRSections = async (workspaceId) => {
  const [users, teams, tasks, logs] = await Promise.all([
    User.find({ workspaceId }).lean(),
    Team.find({ workspaceId }).populate('members').lean(),
    Task.find({ workspaceId, status: { $ne: 'done' } }).lean(),
    AuditLog.find({ 
      workspaceId, 
      action: { $regex: /USER|ROLE|TEAM|INVITATION|ONBOARDING/i } 
    }).sort('-timestamp').limit(10).lean()
  ]);

  const CAPACITY_PER_USER = 40 * 60;
  
  const individualSignals = users.map(user => {
    const userTasks = tasks.filter(t => t.assignedUser?.toString() === user._id.toString());
    const totalMinutes = userTasks.reduce((acc, t) => acc + (t.estimatedDuration || 30), 0);
    const load = Math.round((totalMinutes / CAPACITY_PER_USER) * 100);
    
    return {
      id: user._id,
      name: user.name,
      team: user.role.split('_')[0] || 'Core',
      load
    };
  }).sort((a, b) => b.load - a.load).slice(0, 8);

  const teamCapacity = teams.map(team => {
    const memberIds = team.members.map(m => m._id.toString());
    const teamTasks = tasks.filter(t => memberIds.includes(t.assignedUser?.toString()));
    const totalMinutes = teamTasks.reduce((acc, t) => acc + (t.estimatedDuration || 30), 0);
    const teamCapacityTotal = memberIds.length * CAPACITY_PER_USER;
    const load = teamCapacityTotal > 0 ? Math.round((totalMinutes / teamCapacityTotal) * 100) : 0;

    return {
      team: team.name,
      headcount: memberIds.length,
      load,
      status: load > 90 ? 'Overloaded' : 'Nominal'
    };
  });

  const burnoutRisk = teamCapacity
    .filter(t => t.load > 85)
    .map(t => ({
      team: t.team,
      risk: t.load > 110 ? 'HIGH' : 'MEDIUM',
      trend: t.load > 100 ? 'increasing' : 'stable'
    }));

  const avgUtilization = teamCapacity.length > 0 
    ? Math.round(teamCapacity.reduce((acc, t) => acc + t.load, 0) / teamCapacity.length)
    : 0;

  const overloadedTeams = teamCapacity.filter(t => t.status === 'Overloaded').length;

  const rebalanceSuggestions = [];
  if (overloadedTeams > 0) {
    rebalanceSuggestions.push({
      suggestion: `Redistribute tasks in ${teamCapacity.find(t => t.load > 100)?.team || 'overloaded'} unit`,
      priority: 'CRITICAL'
    });
  }
  if (avgUtilization > 85) {
    rebalanceSuggestions.push({
      suggestion: 'Initiate hiring for backend scaling requisitions',
      priority: 'HIGH'
    });
  }

  return {
    workforceHealth: {
      totalEmployees: users.length,
      avgUtilization,
      overloadedTeams,
      openPositions: 0,
      burnoutRisk: avgUtilization > 85 ? 'HIGH' : (avgUtilization > 65 ? 'STABLE' : 'LOW')
    },
    teamCapacity,
    burnoutRisk,
    hiringImpact: {
      openRoles: [
        { role: 'Senior Backend Engineer', count: 2, urgency: avgUtilization > 90 ? 'Critical' : 'Normal' },
        { role: 'QA Automation Engineer', count: 1, urgency: 'Normal' }
      ],
      impactInsight: { 
        text: overloadedTeams > 0 
          ? `Structural imbalance detected in ${overloadedTeams} units. Immediate rebalancing required to prevent attrition.`
          : 'Capacity matrix indicates optimal workforce stability across all engineering units.'
      }
    },
    orgActivity: logs.map(l => ({
      text: l.action.replace(/_/g, ' '),
      time: formatTimeAgo(l.timestamp)
    })),
    workforceTrend: {
      avgLoad: { now: avgUtilization, last: Math.max(0, avgUtilization - 5) },
      hiringGap: { now: overloadedTeams, last: 0 }
    },
    retentionSignals: [],
    individualSignals,
    rebalanceSuggestions
  };
};

const getOperationsDashboard = async (userId, workspaceId, role) => {
  const r = role.toUpperCase();
  if (r === 'SQA' || r === 'SENIOR_QA_ENGINEER' || r === 'QA_LEAD') {
    return await _getSQASections(workspaceId);
  } else if (r.includes('QA')) {
    return await _getQASections(workspaceId);
  } else if (r === 'HR') {
    return await _getHRSections(workspaceId);
  }

  return { timestamp: new Date() };
};

const _getOverloadedCount = async (workspaceId) => {
  const stats = await Task.aggregate([
    { $match: { workspaceId, status: { $ne: 'done' } } },
    { $group: { _id: '$assignedUser', load: { $sum: '$estimatedDuration' } } },
    { $match: { load: { $gt: 40 } } }
  ]);
  return stats.length;
};

module.exports = {
  getOperationsDashboard,
  _getSQASections,
  _getQASections,
  _getHRSections,
  _getOverloadedCount
};
