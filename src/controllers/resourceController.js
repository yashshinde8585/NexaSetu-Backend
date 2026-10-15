const resourceService = require('../services/resourceService');
const catchAsync = require('../utils/catchAsync');

// Evaluates team utilization and capacity to detect overarching organizational bottlenecks.
exports.getResourceWorkload = catchAsync(async (req, res, next) => {
  const resources = await resourceService.getResourceWorkload(req.user);

  res.status(200).json({
    status: 'success',
    data: {
      resources,
    },
  });
});
