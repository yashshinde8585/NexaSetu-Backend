const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const { calculateProgress, mapTaskToDashboard } = require('../utils/dashboardHelpers');

/**
 * Operations Service
 * Combines logic for QA and HR/People functions.
 */
class OperationsService {
  async getOperationsDashboard(userId, workspaceId, role) {
    if (role.includes('QA')) {
      return await this._getQASections(workspaceId);
    } else if (role === 'PEOPLE_OPS') {
      return await this._getPeopleOpsSections(workspaceId);
    }

    return { timestamp: new Date() };
  }

  async _getQASections(workspaceId) {
    const [totalTasks, blockedTasks, critBugs] = await Promise.all([
      Task.countDocuments({ workspaceId }),
      Task.countDocuments({ workspaceId, blocked: true, status: { $ne: 'done' } }),
      Task.countDocuments({ workspaceId, type: 'bug', priority: 'high', status: { $ne: 'done' } })
    ]);

    const executionBoard = await Task.find({ workspaceId, status: { $ne: 'done' } }).limit(5).lean();

    return {
      controlStrip: {
        testCount: totalTasks,
        failed: critBugs > 0 ? 2 : 0,
        blocked: blockedTasks,
        releaseRisk: critBugs > 2 ? 'HIGH' : 'LOW'
      },
      executionBoard: executionBoard.map(t => ({
        title: t.title,
        module: 'General',
        status: t.status,
        priority: t.priority,
        blocked: t.blocked,
        blockedBy: t.blocked ? 'Dependency' : null
      })),
      bugTracker: [],
      cycleProgress: {
         percentage: totalTasks > 0 ? Math.round(((totalTasks - blockedTasks) / totalTasks) * 100) : 0,
         executed: totalTasks - blockedTasks,
         total: totalTasks,
         passed: totalTasks - blockedTasks - critBugs,
         failed: critBugs
      },
      releaseStatus: {
        status: (totalTasks > 0 && critBugs === 0) ? 'READY' : (totalTasks === 0 ? 'NO DATA' : 'NOT READY'),
        isReady: totalTasks > 0 && critBugs === 0,
        criticalBugs: critBugs,
        failedTests: 0,
        blockedTests: blockedTasks
      },
      buildStatus: { environment: 'Production', version: 'v1.0.0', status: 'Stable' },
      coverage: { 'Auth Layer': 0, 'Data API': 0, 'Audit Engine': 0 },
      regressionStatus: { total: 0, passed: 0, failed: 0, pending: 0 },
      activity: []
    };
  }

  async _getPeopleOpsSections(workspaceId) {
    const totalUsers = await User.countDocuments({ workspaceId });
    const atRiskProjects = await Project.countDocuments({ workspaceId, status: 'at_risk' });

    return {
      workforceHealth: {
        totalEmployees: totalUsers,
        avgUtilization: totalUsers > 0 ? 80 : 0,
        overloadedTeams: atRiskProjects > 0 ? 1 : 0,
        openPositions: 0,
        burnoutRisk: atRiskProjects > 2 ? 'HIGH' : 'STABLE'
      },
      teamCapacity: [],
      burnoutRisk: [],
      hiringImpact: {
        openRoles: [],
        impactInsight: { text: totalUsers > 0 ? 'Capacity balanced across active projects.' : 'No active personnel identified.' }
      },
      orgActivity: [],
      workforceTrend: {
        avgLoad: { now: totalUsers > 0 ? 80 : 0, last: totalUsers > 0 ? 80 : 0 },
        hiringGap: { now: 0, last: 0 }
      },
      retentionSignals: [],
      individualSignals: [],
      rebalanceSuggestions: []
    };
  }

  async _getOverloadedCount(workspaceId) {
    const stats = await Task.aggregate([
      { $match: { workspaceId, status: { $ne: 'done' } } },
      { $group: { _id: '$assignedUser', load: { $sum: '$estimatedDuration' } } },
      { $match: { load: { $gt: 40 } } }
    ]);
    return stats.length;
  }
}

module.exports = new OperationsService();
