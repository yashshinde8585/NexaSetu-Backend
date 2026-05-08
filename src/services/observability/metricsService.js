const Metric = require('../../models/Metric');

const recordMetric = async (type, value, workspaceId, teamId = null) => {
  const metric = new Metric({ type, value, workspaceId, teamId });
  await metric.save();
  return metric;
};

const getMetrics = async (workspaceId, filters = {}) => {
  const query = { workspaceId, ...filters };
  return Metric.find(query).sort({ timestamp: -1 }).limit(100);
};

const calculateVelocity = async (teamId, sprintId) => {
  // Stub for calculating velocity
  const velocity = Math.floor(Math.random() * 50) + 10;
  await recordMetric('velocity', velocity, null, teamId);
  return velocity;
};

const calculateTaskCompletionRate = async (teamId) => {
  // Stub
  const rate = Math.random() * 100;
  await recordMetric('completion_rate', rate, null, teamId);
  return rate;
};

module.exports = {
  recordMetric,
  getMetrics,
  calculateVelocity,
  calculateTaskCompletionRate,
};

