const AILog = require('../models/AILog');
const Project = require('../models/Project');

/**
 * Controller for viewing AI Agent Decisions and Actions
 */

exports.getActivityLogs = async (req, res) => {
  try {
    // 1. Get projects management access
    const projects = await Project.find({ members: req.user.id });
    const projectIds = projects.map(p => p._id);

    // 2. Fetch logs related to these projects
    const logs = await AILog.find({ 
      project: { $in: projectIds } 
    })
    .sort({ timestamp: -1 })
    .limit(20)
    .populate('project', 'name');

    res.status(200).json({
      status: 'success',
      results: logs.length,
      data: { logs }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch activity logs' });
  }
};
