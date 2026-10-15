const MetricsService = require('./metricsService');
const HealthService = require('./healthService');

const generateDashboardReport = async (workspaceId, teamId) => {
  const metrics = await MetricsService.getMetrics(workspaceId, { teamId });
  const health = await HealthService.getSystemHealth();

  return {
    metrics,
    systemHealth: health,
    generatedAt: new Date(),
  };
};

module.exports = {
  generateDashboardReport,
};
