const AILog = require('../models/AILog');
const Project = require('../models/Project');
const { getProjectAccessQuery } = require('../utils/queryHelpers');

const getActivityLogs = async (user) => {
  // Determine the user's project access scope.
  const projects = await Project.find(getProjectAccessQuery(user));
  const projectIds = projects.map((p) => p._id);

  // Filter AI event records by the resolved scope boundaries.
  const logs = await AILog.find({
    project: { $in: projectIds },
  })
    .sort({ timestamp: -1 })
    .limit(20)
    .populate('project', 'name');

  return logs;
};

module.exports = {
  getActivityLogs,
};
