const leadershipService = require('../services/leadershipService');
const catchAsync = require('../utils/catchAsync');

/**
 * Leadership Workspace Controller
 * Aggregates high-level metrics for executives and managers.
 */
exports.getDashboard = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const workspaceId = req.user.workspaceId;
  const role = req.user.role;
  const requestedView = req.query.view || role;

  const data = await leadershipService.getLeadershipDashboard(userId, workspaceId, requestedView);

  res.status(200).json({
    status: 'success',
    data: {
      ...data,
      roleDisplay: role.replace('_', ' '),
      viewType: 'STRATEGIC_COMMAND_CENTER'
    }
  });
});

/**
 * Get breakdown by specific roles within a function
 */
exports.getRoleBreakdown = catchAsync(async (req, res, next) => {
  const { category } = req.params;
  const workspaceId = req.user.workspaceId;
  const data = await leadershipService.getRoleBreakdown(workspaceId, category);
  res.status(200).json({ status: 'success', data });
});

/**
 * Get individual performance breakdown for a specific role
 */
exports.getIndividualBreakdown = catchAsync(async (req, res, next) => {
  const { role } = req.params;
  const workspaceId = req.user.workspaceId;
  const data = await leadershipService.getIndividualBreakdown(workspaceId, role);
  res.status(200).json({ status: 'success', data });
});

/**
 * Manually trigger dashboard data recalculation
 */
exports.recalculate = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const workspaceId = req.user.workspaceId;
  const role = req.user.role;
  const requestedView = req.query.view || role;

  // By calling the service again, we bypass potential stale caches if implemented
  // and ensure fresh aggregation from DB
  const data = await leadershipService.getLeadershipDashboard(userId, workspaceId, requestedView);

  res.status(200).json({
    status: 'success',
    message: 'RECALCULATION_COMPLETE',
    data
  });
});
