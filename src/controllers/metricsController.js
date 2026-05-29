const metricsService = require('../services/metricsService');
const catchAsync = require('../utils/catchAsync');

// Log a specific user event or interaction for behavioral analysis
exports.trackEvent = catchAsync(async (req, res, next) => {
  const { eventType, payload } = req.body;

  await metricsService.trackEvent(req.user, eventType, payload, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    status: 'success',
    message: 'Event logged successfully',
  });
});
