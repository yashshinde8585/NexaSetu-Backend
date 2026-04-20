const mongoose = require('mongoose');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const AgentOrchestrator = require('../services/agentOrchestrator');
const AppError = require('../utils/appError');

class SprintStatsService {
  async getProjectsForSprint(sprintId, workspaceId) {
    const Project = mongoose.model('Project');
    const projects = await Project.find({ sprint: sprintId, workspaceId });
    return projects.map((p) => p._id);
  }

  async finalizeSprint(user, sprintId) {
    const sprintObjectId = new mongoose.Types.ObjectId(sprintId);

    const sprint = await Sprint.findOne({
      _id: sprintObjectId,
      workspaceId: user.workspaceId,
    });
    if (!sprint) throw new AppError('Sprint not found', 404);

    const sprintProjects = await this.getProjectsForSprint(
      sprintObjectId,
      user.workspaceId
    );
    if (sprint.project && !sprintProjects.some(id => id.toString() === sprint.project.toString())) {
      sprintProjects.push(sprint.project);
    }
    const tasks = await Task.find({
      $or: [
        { sprint: sprintObjectId },
        { 
          $and: [
            { project: { $in: sprintProjects } },
            { $or: [{ sprint: null }, { sprint: { $exists: false } }] }
          ]
        }
      ],
    }).populate('project assignedUser');

    const completedTasks = tasks.filter((t) => t.status === 'done');
    const pendingTasks = tasks.filter((t) => t.status !== 'done');

    const prompt = `
      Analyze the following sprint performance and generate a concise tactical summary:
      Sprint Name: ${sprint.name}
      Total Tasks: ${tasks.length}
      Completed: ${completedTasks.length}
      Pending: ${pendingTasks.length}
      Major Projects: ${[...new Set(tasks.map((t) => t.project?.name))].join(', ')}
      Blockers: ${tasks.filter((t) => (t.dependencies || []).length > 0).length}
      
      Provide:
      1. A strategic overview of the achievements.
      2. Identification of velocity bottlenecks.
      3. Recommendations for the next cycle.
    `;

    const aiSummary = await AgentOrchestrator.processCommand(prompt, user);

    const contributions = {};
    completedTasks.forEach((t) => {
      if (t.assignedUser) {
        const name = t.assignedUser.name;
        contributions[name] = (contributions[name] || 0) + 1;
      }
    });

    const topContributors = Object.entries(contributions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, missions: count }));

    return {
      sprint: sprint.name,
      summary: aiSummary.response,
      topContributors,
      metrics: {
        velocity: completedTasks.length,
        retention: 100 - (pendingTasks.length / tasks.length) * 100,
        spillover: pendingTasks.length,
      },
    };
  }

  async getSprintStats(user, sprintId) {
    const sprintObjectId = new mongoose.Types.ObjectId(sprintId);

    const sprint = await Sprint.findOne({
      _id: sprintObjectId,
      workspaceId: user.workspaceId,
    });

    if (!sprint) {
      throw new AppError('No sprint found with that ID in your workspace', 404);
    }

    const sprintProjects = await this.getProjectsForSprint(
      sprintObjectId,
      user.workspaceId
    );
    
    if (sprint.project && !sprintProjects.some(id => id.toString() === sprint.project.toString())) {
      sprintProjects.push(sprint.project);
    }

    const aggregation = await Task.aggregate([
      {
        $match: {
          $or: [
            { sprint: sprintObjectId },
            { 
              $and: [
                { project: { $in: sprintProjects } },
                { $or: [{ sprint: null }, { sprint: { $exists: false } }] }
              ]
            }
          ]
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
                },
                inProgress: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
                },
                inReview: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_review'] }, 1, 0] },
                },
                pending: {
                  $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] },
                },
                totalOpen: {
                  $sum: { $cond: [{ $ne: ['$status', 'done'] }, 1, 0] },
                },
                overdue: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'done'] },
                          { $lt: ['$dueDate', new Date()] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          avgDuration: [
            {
              $match: {
                status: 'done',
                startedAt: { $ne: null },
                completedAt: { $ne: null },
              },
            },
            {
              $project: {
                duration: {
                  $divide: [
                    { $subtract: ['$completedAt', '$startedAt'] },
                    1000 * 60 * 60 * 24,
                  ], // convert to days
                },
              },
            },
            {
              $group: {
                _id: null,
                avgFlux: { $avg: '$duration' },
              },
            },
          ],
          blockers: [
            {
              $match: {
                dependencies: { $not: { $size: 0 } },
                status: { $ne: 'done' },
              },
            },
            { $count: 'count' },
          ],
          workload: [
            { $match: { assignedUser: { $ne: null } } },
            {
              $group: {
                _id: '$assignedUser',
                count: { $sum: 1 },
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user',
              },
            },
            { $unwind: '$user' },
            {
              $project: {
                _id: 1,
                name: '$user.name',
                role: '$user.role',
                count: 1,
              },
            },
            { $sort: { count: -1 } },
          ],
          velocityHistory: [
            {
              $match: {
                $or: [
                  { sprint: sprintObjectId },
                  { 
                    $and: [
                      { project: { $in: sprintProjects } },
                      { $or: [{ sprint: null }, { sprint: { $exists: false } }] }
                    ]
                  }
                ],
                status: 'done',
                completedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
              }
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
                count: { $sum: 1 }
              }
            },
            { $sort: { "_id": 1 } }
          ]
        },
      },
    ]);

    const raw = aggregation[0];
    const summary = raw.summary[0] || {
      total: 0,
      completed: 0,
      inProgress: 0,
      inReview: 0,
      overdue: 0,
    };
    const avgFlux = raw.avgDuration[0]?.avgFlux || 0;
    const blockerCount = raw.blockers[0]?.count || 0;
    const sprintWorkload = raw.workload || [];

    const completionRate =
      summary.total > 0
        ? ((summary.completed / summary.total) * 100).toFixed(1)
        : 0;
    const strategicDebt =
      summary.total > 0
        ? ((summary.overdue / summary.total) * 100).toFixed(1)
        : 0;
    const blockerDensity =
      summary.total > 0 ? (blockerCount / summary.total).toFixed(2) : 0;

    const trends = {
      completion: '+4.2%',
      flux: '-0.5d',
      blockers: 'Stable',
      debt: '-2%',
    };

    const velocitySpark = Array(7).fill(0).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dStr = d.toISOString().split('T')[0];
      const found = raw.velocityHistory?.find(v => v._id === dStr);
      return found ? found.count : 0;
    });

    return {
      sprint: {
        id: sprint._id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status,
      },
      metrics: {
        completionRate: `${completionRate}%`,
        avgTaskFlux: `${avgFlux.toFixed(1)}d`,
        blockerDensity:
          blockerDensity > 0.5
            ? 'High'
            : blockerDensity > 0.2
              ? 'Medium'
              : 'Low',
        strategicDebt: `${strategicDebt}%`,
        velocitySpark,
        flowEfficiency: '78%', 
        raw: {
          total: summary.total,
          completed: summary.completed,
          inProgress: summary.inProgress,
          inReview: summary.inReview,
          totalOpen: Math.max(
            0,
            summary.total -
              (summary.completed + summary.inProgress + summary.inReview)
          ),
          overdue: summary.overdue,
          blockers: blockerCount,
        },
        workload: sprintWorkload,
      },
      trends,
    };
  }

  async getSprintReportData(user, sprintId) {
    const sprintObjectId = new mongoose.Types.ObjectId(sprintId);

    const sprint = await Sprint.findOne({
      _id: sprintObjectId,
      workspaceId: user.workspaceId,
    });
    if (!sprint) throw new AppError('Sprint not found', 404);

    const sprintProjects = await this.getProjectsForSprint(
      sprintObjectId,
      user.workspaceId
    );
    if (sprint.project && !sprintProjects.some(id => id.toString() === sprint.project.toString())) {
      sprintProjects.push(sprint.project);
    }
    const Project = mongoose.model('Project');
    const projectDocs = await Project.find({ _id: { $in: sprintProjects } });

    const tasks = await Task.find({
      $or: [
        { sprint: sprintObjectId },
        { 
          $and: [
            { project: { $in: sprintProjects } },
            { $or: [{ sprint: null }, { sprint: { $exists: false } }] }
          ]
        }
      ],
    }).populate('project assignedUser createdBy');

    return {
      sprint: {
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status,
      },
      projects: projectDocs.map((p) => ({
        name: p.name,
        status: p.status,
        percentage: p.percentage || 0,
        totalTasks: p.totalTasks || 0,
        completedTasks: p.completedTasks || 0,
      })),
      tasks: tasks.map((t) => ({
        title: t.title,
        project: t.project?.name || 'Unassigned',
        assignedTo: t.assignedUser?.name || 'Unassigned',
        status: t.status,
        dueDate: t.dueDate,
        priority: t.priority || 'medium',
        createdAt: t.createdAt,
      })),
    };
  }
}

module.exports = new SprintStatsService();
