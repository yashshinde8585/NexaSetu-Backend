const aiActivityService = require('../services/aiActivityService');
const catchAsync = require('../utils/catchAsync');

// Retrieves telemetry and audit logs of executing AI agents across authorized projects.
exports.getActivityLogs = catchAsync(async (req, res, next) => {
  const logs = await aiActivityService.getActivityLogs(req.user);

  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs },
  });
});
