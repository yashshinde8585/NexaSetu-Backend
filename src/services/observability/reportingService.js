const MetricsService = require('./metricsService');
const HealthService = require('./healthService');

class ReportingService {
  async generateDashboardReport(workspaceId, teamId) {
    const metrics = await MetricsService.getMetrics(workspaceId, { teamId });
    const health = await HealthService.getSystemHealth();

    return {
      metrics,
      systemHealth: health,
      generatedAt: new Date()
    };
  }
}

module.exports = new ReportingService();
