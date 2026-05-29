const dashboardService = require('../services/dashboardService');

// Aggregates complex analytics and telemetry data for the main dashboard view.
exports.getDashboardStats = async (req, res) => {
  try {
    const data = await dashboardService.getDashboardStats(
      req.user,
      req.query.sprintId
    );

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: error.message || 'Failed to fetch dashboard data',
    });
  }
};
