const MetricsService = require('../services/observability/metricsService');
const HealthService = require('../services/observability/healthService');
const ReportingService = require('../services/observability/reportingService');

exports.getMetrics = async (req, res, next) => {
  try {
    const metrics = await MetricsService.getMetrics(req.user.workspaceId, req.query);
    res.status(200).json({ status: 'success', data: { metrics } });
  } catch (err) { next(err); }
};

exports.getHealth = async (req, res, next) => {
  try {
    const health = await HealthService.getSystemHealth();
    res.status(200).json({ status: 'success', data: { health } });
  } catch (err) { next(err); }
};

exports.getIntegrity = async (req, res, next) => {
  try {
    const integrity = await HealthService.getSystemIntegrity();
    res.status(200).json(integrity);
  } catch (err) { next(err); }
};

exports.getReports = async (req, res, next) => {
  try {
    const report = await ReportingService.generateDashboardReport(req.user.workspaceId, req.query.teamId);
    res.status(200).json({ status: 'success', data: { report } });
  } catch (err) { next(err); }
};
