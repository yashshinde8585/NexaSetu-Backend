const operationsService = require('../services/operationsService');
const catchAsync = require('../utils/catchAsync');

/**
 * Operations Workspace Controller
 * Aggregates data for QA, Compliance, and HR/People functions.
 */
exports.getDashboard = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const workspaceId = req.user.workspaceId;
  const role = req.user.role;

  const data = await operationsService.getOperationsDashboard(userId, workspaceId, role);

  res.status(200).json({
    status: 'success',
    data: {
      ...data,
      viewType: 'OPERATIONS_CONSOLE'
    }
  });
});
