const Sprint = require('../../models/Sprint');
const MetricsService = require('../observability/metricsService');

const createSprint = async (data, creatorId) => {
  const sprint = new Sprint({ ...data, createdBy: creatorId });
  await sprint.save();
  
  await MetricsService.recordMetric('sprint_created', 1, sprint.workspaceId, sprint.teamId);
  
  return sprint;
};

const updateSprint = async (id, updates) => {
  const sprint = await Sprint.findByIdAndUpdate(id, updates, { new: true });
  if (sprint.status === 'COMPLETED') {
    await MetricsService.calculateVelocity(sprint.teamId, sprint._id);
  }
  return sprint;
};

const getSprints = async (filters, scopedTeams) => {
  const query = { ...filters };
  
  if (scopedTeams && scopedTeams.length > 0) {
    query.teamId = { $in: scopedTeams };
  }
  
  return Sprint.find(query).sort({ startDate: -1 });
};

module.exports = {
  createSprint,
  updateSprint,
  getSprints,
};

