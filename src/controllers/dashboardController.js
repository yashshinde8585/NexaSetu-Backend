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
    }).populate('createdBy', 'name email').populate('members', 'name email');

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
                done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
                todo: { $sum: { $cond: [{ $eq: ["$status", "todo"] }, 1, 0] } },
                inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
                inReview: { $sum: { $cond: [{ $eq: ["$status", "in_review"] }, 1, 0] } },
                aiGenerated: { $sum: { $cond: [{ $eq: ["$isAiGenerated", true] }, 1, 0] } },
                delayed: { 
                  $sum: { 
                    $cond: [
                      { 
                        $and: [
                          { $ne: ["$status", "done"] },
                          { $lt: ["$dueDate", new Date()] }
                        ] 
                      }, 1, 0
                    ] 
                  } 
                },
                atRisk: { 
                  $sum: { 
                    $cond: [
                      { 
                        $and: [
                          { $ne: ["$status", "done"] },
                          { $gte: ["$dueDate", new Date()] },
                          { $lt: ["$dueDate", new Date(new Date().getTime() + 24 * 60 * 60 * 1000)] }
                        ] 
                      }, 1, 0
                    ] 
                  } 
                }
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
      in_review: 0,
      done: 0,
      total: 0
    };

    statusStats.forEach(s => {
      stats[s._id] = s.count;
      stats.total += s.count;
    });

    // Combine project details with stats
    const enrichedProjects = projects.map(p => {
      const pStat = projectStats.find(ps => ps._id.toString() === p._id.toString()) || { 
        total: 0, 
        done: 0, 
        todo: 0, 
        inProgress: 0, 
        inReview: 0,
        aiGenerated: 0,
        delayed: 0,
        atRisk: 0
      };
      
      const percentage = pStat.total > 0 ? Math.round((pStat.done / pStat.total) * 100) : 0;
      
      // Health Score Calculation Logic (Updated to consider At Risk)
      // 1. Progress (50%)
      const progressScore = percentage * 0.5;
      
      // 2. Pending Load (30%) - Inverse of (todo + in-progress)/total
      const pendingTasks = pStat.todo + pStat.inProgress;
      const pendingScore = pStat.total > 0 ? (1 - (pendingTasks / pStat.total)) * 100 * 0.3 : 30; // 30 if no tasks left
      
      // 3. Delay Factor (20%) - Consider both delayed and at-risk
      // Delay = 1.0 weight, At Risk = 0.5 weight
      const delayImpact = (pStat.delayed + (pStat.atRisk * 0.5)) / pStat.total;
      const delayScore = pStat.total > 0 ? (1 - delayImpact) * 100 * 0.2 : 20;

      const healthScore = pStat.total > 0 ? Math.round(progressScore + pendingScore + delayScore) : 100;
      
      let healthLabel = 'Healthy';
      if (healthScore < 50) healthLabel = 'Critical';
      else if (healthScore < 80) healthLabel = 'Moderate Risk';

      return {
        _id: p._id,
        name: p.name,
        totalTasks: pStat.total,
        completedTasks: pStat.done,
        pendingTasks: pStat.todo,
        inProgressTasks: pStat.inProgress,
        inReviewTasks: pStat.inReview,
        aiGeneratedTasks: pStat.aiGenerated,
        delayedTasks: pStat.delayed,
        atRiskTasks: pStat.atRisk,
        percentage,
        healthScore,
        healthLabel,
        riskLevel: healthScore < 50 || pStat.delayed > 5 ? 'High' : (healthScore < 80 || pStat.delayed > 2 ? 'Medium' : 'Low'),
        createdAt: p.createdAt,
        createdBy: p.createdBy,
        members: p.members
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
