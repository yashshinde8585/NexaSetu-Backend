const AILog = require('../models/AILog');
const Project = require('../models/Project');
const { getProjectAccessQuery } = require('../utils/queryHelpers');

// Retrieves telemetry and audit logs of executing AI agents across authorized projects.
exports.getActivityLogs = async (req, res) => {
  try {
    // Determine the user's project access scope.
    const projects = await Project.find(getProjectAccessQuery(req.user));
    const projectIds = projects.map((p) => p._id);

    // Filter AI event records by the resolved scope boundaries.
    const logs = await AILog.find({
      project: { $in: projectIds },
    })
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('project', 'name');

    res.status(200).json({
      status: 'success',
      results: logs.length,
      data: { logs },
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: 'error', message: 'Failed to fetch activity logs' });
  }
};
