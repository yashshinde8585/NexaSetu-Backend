const Metric = require('../../models/Metric');

class MetricsService {
  async recordMetric(type, value, workspaceId, teamId = null) {
    const metric = new Metric({ type, value, workspaceId, teamId });
    await metric.save();
    return metric;
  }

  async getMetrics(workspaceId, filters = {}) {
    const query = { workspaceId, ...filters };
    return Metric.find(query).sort({ timestamp: -1 }).limit(100);
  }

  async calculateVelocity(teamId, sprintId) {
    // Stub for calculating velocity
    const velocity = Math.floor(Math.random() * 50) + 10;
    await this.recordMetric('velocity', velocity, null, teamId);
    return velocity;
  }

  async calculateTaskCompletionRate(teamId) {
    // Stub
    const rate = Math.random() * 100;
    await this.recordMetric('completion_rate', rate, null, teamId);
    return rate;
  }
}

module.exports = new MetricsService();
