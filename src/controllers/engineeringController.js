const engineeringService = require('../services/engineeringService');
const catchAsync = require('../utils/catchAsync');

/**
 * Engineering Workspace Controller
 * Aggregates data for engineering roles (SWE, JRE, Intern, EM).
 */
exports.getWorkspace = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const workspaceId = req.user.workspaceId;
  const role = req.user.role; // Extracting role from JWT payload/User object

  const dashboardData = await engineeringService.getWorkspaceData(
    userId,
    workspaceId,
    role
  );

  res.status(200).json({
    status: 'success',
    data: {
      ...dashboardData,
      roleDisplay: role.replace('_', ' '),
      timestamp: new Date(),
    },
  });
});
