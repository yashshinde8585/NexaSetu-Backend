const Sprint = require('../../models/Sprint');
const MetricsService = require('../observability/metricsService');

class SprintService {
  async createSprint(data, creatorId) {
    const sprint = new Sprint({ ...data, createdBy: creatorId });
    await sprint.save();
    
    await MetricsService.recordMetric('sprint_created', 1, sprint.workspaceId, sprint.teamId);
    
    return sprint;
  }

  async updateSprint(id, updates) {
    const sprint = await Sprint.findByIdAndUpdate(id, updates, { new: true });
    if (sprint.status === 'COMPLETED') {
      await MetricsService.calculateVelocity(sprint.teamId, sprint._id);
    }
    return sprint;
  }

  async getSprints(filters, scopedTeams) {
    const query = { ...filters };
    
    if (scopedTeams && scopedTeams.length > 0) {
      query.teamId = { $in: scopedTeams };
    }
    
    return Sprint.find(query).sort({ startDate: -1 });
  }
}

module.exports = new SprintService();
