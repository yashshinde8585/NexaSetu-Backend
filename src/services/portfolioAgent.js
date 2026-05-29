const Project = require('../models/Project');
const Task = require('../models/Task');
const logger = require('../utils/logger');

const performAudit = async (projects, resources) => {
  try {
    const recommendations = [];
    const now = new Date();

    // Rank portfolios sequentially by operational risk levels.
    const rankedProjects = projects
      .map((p) => {
        let riskLevel = 'Low';
        if (p.healthScore < 40 || p.delayedTasksCount > 5) riskLevel = 'High';
        else if (p.healthScore < 70 || p.delayedTasksCount > 2)
          riskLevel = 'Medium';

        return { ...p, riskLevel };
      })
      .sort((a, b) => a.healthScore - b.healthScore); // Sort by health (ascending)

    const overloadedUsers = resources.filter(
      (r) => r.workloadStatus === 'Overloaded'
    );
    const availableUsers = resources.filter(
      (r) => r.workloadStatus === 'Normal' && r.activeTasksCount === 0
    );

    if (overloadedUsers.length > 0 && availableUsers.length > 0) {
      recommendations.push({
        type: 'resource_optimization',
        priority: 'medium',
        message: `Cross-project resource imbalance detected.`,
        action: `Redirect unassigned team members to help overloaded experts.`,
        reason: `Resource efficiency is currently sub-optimal across the portfolio.`,
      });
    }

    // Escalate critical risk vectors necessitating urgent human intervention.
    const highRisk = rankedProjects.filter((p) => p.riskLevel === 'High');
    if (highRisk.length > 0) {
      recommendations.push({
        type: 'priority_focus',
        priority: 'high',
        message: `Crucial focus required on project: "${highRisk[0].name}"`,
        action: `Immediately address pending and delayed tasks in this project.`,
        reason: `Project health has dropped below critical threshold (${highRisk[0].healthScore}%)`,
      });
    }

    return {
      projects: rankedProjects,
      globalRecommendations: recommendations,
      topPriorityProjectId: highRisk.length > 0 ? highRisk[0]._id : null,
    };
  } catch (error) {
    logger.error('[PortfolioAgent] Audit Error: %o', error);
    throw error;
  }
};

module.exports = {
  performAudit,
};
