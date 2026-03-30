const mongoose = require('mongoose');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const AgentOrchestrator = require('../services/agentOrchestrator');


exports.finalizeSprint = catchAsync(async (req, res, next) => {
  const sprintId = req.params.id;
  const sprintObjectId = new mongoose.Types.ObjectId(sprintId);

  // 1. Fetch sprint and stats
  const sprint = await Sprint.findOne({ _id: sprintObjectId, workspaceId: req.user.workspaceId });
  if (!sprint) return next(new AppError('Sprint not found', 404));

  // 2. Fetch all tasks for this sprint to generate summary
  const sprintProjects = await getProjectsForSprint(sprintObjectId, req.user.workspaceId);
  const tasks = await Task.find({
    $or: [{ sprint: sprintObjectId }, { project: { $in: sprintProjects } }]
  }).populate('project assignedUser');

  const completedTasks = tasks.filter(t => t.status === 'done');
  const pendingTasks = tasks.filter(t => t.status !== 'done');

  // 3. Generate AI Summary using AgentOrchestrator
  const prompt = `
    Analyze the following sprint performance and generate a concise tactical summary:
    Sprint Name: ${sprint.name}
    Total Tasks: ${tasks.length}
    Completed: ${completedTasks.length}
    Pending: ${pendingTasks.length}
    Major Projects: ${[...new Set(tasks.map(t => t.project?.name))].join(', ')}
    Blockers: ${tasks.filter(t => (t.dependencies || []).length > 0).length}
    
    Provide:
    1. A strategic overview of the achievements.
    2. Identification of velocity bottlenecks.
    3. Recommendations for the next cycle.
  `;

  const aiSummary = await AgentOrchestrator.processCommand(prompt, req.user);

  // 4. Identify Top Contributors
  const contributions = {};
  completedTasks.forEach(t => {
    if (t.assignedUser) {
      const name = t.assignedUser.name;
      contributions[name] = (contributions[name] || 0) + 1;
    }
  });

  const topContributors = Object.entries(contributions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, missions: count }));

  res.status(200).json({
    status: 'success',
    data: {
      sprint: sprint.name,
      summary: aiSummary.response,
      topContributors,
      metrics: {
        velocity: completedTasks.length,
        retention: 100 - (pendingTasks.length / tasks.length * 100),
        spillover: pendingTasks.length
      }
    }
  });
});

// Helper to find projects linked to a sprint (isolated by workspace)
async function getProjectsForSprint(sprintId, workspaceId) {
    const Project = mongoose.model('Project');
    const projects = await Project.find({ sprint: sprintId, workspaceId });
    return projects.map(p => p._id);
}


exports.getSprintStats = catchAsync(async (req, res, next) => {
  const sprintId = req.params.id;
  const sprintObjectId = new mongoose.Types.ObjectId(sprintId);
  
  // 1. Verify sprint exists and in workspace
  const sprint = await Sprint.findOne({
    _id: sprintObjectId,
    workspaceId: req.user.workspaceId
  });

  if (!sprint) {
    return next(new AppError('No sprint found with that ID in your workspace', 404));
  }

  const sprintProjects = await getProjectsForSprint(sprintObjectId, req.user.workspaceId);

  // 2. Aggregate stats (Directly linked tasks OR tasks in projects linked to this sprint)
  const aggregation = await Task.aggregate([
    { 
      $match: { 
        project: { $in: sprintProjects },
        $or: [
          { sprint: sprintObjectId },
          { sprint: { $exists: false } },
          { sprint: null }
        ]
      } 
    },
    {
      $facet: {

        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
              inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
              inReview: { $sum: { $cond: [{ $eq: ["$status", "in_review"] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ["$status", "todo"] }, 1, 0] } },
              totalOpen: { $sum: { $cond: [{ $ne: ["$status", "done"] }, 1, 0] } },
              overdue: { 
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
              }
            }
          }
        ],
        avgDuration: [
          { $match: { status: "done", startedAt: { $ne: null }, completedAt: { $ne: null } } },
          {
            $project: {
              duration: {
                $divide: [{ $subtract: ["$completedAt", "$startedAt"] }, 1000 * 60 * 60 * 24] // convert to days
              }
            }
          },
          {
            $group: {
              _id: null,
              avgFlux: { $avg: "$duration" }
            }
          }
        ],
        blockers: [
          { $match: { dependencies: { $not: { $size: 0 } }, status: { $ne: "done" } } },
          { $count: "count" }
        ],
        workload: [
          { $match: { assignedUser: { $ne: null } } },
          {
            $group: {
              _id: "$assignedUser",
              count: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user"
            }
          },
          { $unwind: "$user" },
          {
            $project: {
              _id: 1,
              name: "$user.name",
              role: "$user.role",
              count: 1
            }
          },
          { $sort: { count: -1 } }
        ]
      }
    }
  ]);

  const raw = aggregation[0];
  const summary = raw.summary[0] || { total: 0, completed: 0, inProgress: 0, inReview: 0, overdue: 0 };
  const avgFlux = raw.avgDuration[0]?.avgFlux || 0;
  const blockerCount = raw.blockers[0]?.count || 0;
  const sprintWorkload = raw.workload || [];

  // Calculate Metrics
  const completionRate = summary.total > 0 ? ((summary.completed / summary.total) * 100).toFixed(1) : 0;
  const strategicDebt = summary.total > 0 ? ((summary.overdue / summary.total) * 100).toFixed(1) : 0;
  const blockerDensity = summary.total > 0 ? (blockerCount / summary.total).toFixed(2) : 0;

  // Mock trends for now since we don't have historical data easily accessible in this scan
  const trends = {
    completion: "+4.2%",
    flux: "-0.5d",
    blockers: "Stable",
    debt: "-2%"
  };

  res.status(200).json({
    status: 'success',
    data: {
      sprint: {
        id: sprint._id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status
      },
      metrics: {
        completionRate: `${completionRate}%`,
        avgTaskFlux: `${avgFlux.toFixed(1)}d`,
        blockerDensity: blockerDensity > 0.5 ? 'High' : blockerDensity > 0.2 ? 'Medium' : 'Low',
        strategicDebt: `${strategicDebt}%`,
        raw: {
            total: summary.total,
            completed: summary.completed,
            inProgress: summary.inProgress,
            inReview: summary.inReview,
            totalOpen: Math.max(0, summary.total - (summary.completed + summary.inProgress + summary.inReview)),
            overdue: summary.overdue,
            blockers: blockerCount
        },
        workload: sprintWorkload
      },
      trends
    }
  });
});
