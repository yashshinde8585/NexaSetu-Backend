const Project = require('../models/Project');
const Task = require('../models/Task');

/**
 * Controller for aggregating dashboard analytics
 */

exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Get all projects where the user is a creator or member
    const projects = await Project.find({
      $or: [
        { createdBy: req.user._id },
        { members: req.user._id }
      ]
    });

    const projectIds = projects.map(p => p._id);

    // 2. Aggregate overall and project-wise stats in one scan
    const aggregationResult = await Task.aggregate([
      { $match: { project: { $in: projectIds } } },
      {
        $facet: {
          overallStats: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          projectWiseStats: [
            { 
              $group: { 
                _id: "$project", 
                total: { $sum: 1 },
                done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } }
              } 
            }
          ]
        }
      }
    ]);

    const statusStats = aggregationResult[0].overallStats;
    const projectStats = aggregationResult[0].projectWiseStats;

    const stats = {
      todo: 0,
      in_progress: 0,
      done: 0,
      total: 0
    };

    statusStats.forEach(s => {
      stats[s._id] = s.count;
      stats.total += s.count;
    });

    // Combine project details with stats
    const enrichedProjects = projects.map(p => {
      const pStat = projectStats.find(ps => ps._id.toString() === p._id.toString()) || { total: 0, done: 0 };
      const percentage = pStat.total > 0 ? Math.round((pStat.done / pStat.total) * 100) : 0;
      
      return {
        _id: p._id,
        name: p.name,
        totalTasks: pStat.total,
        completedTasks: pStat.done,
        percentage,
        createdAt: p.createdAt
      };
    });

    // 4. Get recent activity (last 5 updated tasks across projects)
    const recentActivity = await Task.find({ project: { $in: projectIds } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('project', 'name');

    res.status(200).json({
      status: 'success',
      data: {
        summary: stats,
        projects: enrichedProjects,
        recentActivity
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard data' });
  }
};
