const mongoose = require('mongoose');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const AppError = require('../utils/appError');

const getDashboardStats = async (user, sprintId) => {
  const sprintFilter = sprintId ? new mongoose.Types.ObjectId(sprintId) : null;

  const projects = await Project.find(getProjectAccessQuery(user))
    .populate('createdBy', 'name email')
    .populate('members', 'name email')
    .lean();

  const projectIds = projects.map((p) => p._id);
  const projectsInSprintIds = projects
    .filter((p) => p.sprint?.toString() === sprintId)
    .map((p) => p._id);

  const baseMatch = { project: { $in: projectIds } };
  if (sprintFilter) {
    baseMatch.$or = [
      { sprint: sprintFilter },
      {
        $and: [
          { sprint: { $exists: false } },
          { project: { $in: projectsInSprintIds } },
        ],
      },
      {
        $and: [{ sprint: null }, { project: { $in: projectsInSprintIds } }],
      },
    ];
  }

  const [aggregationResult, recentActivity] = await Promise.all([
    Task.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          overallStats: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          personalStats: [
            {
              $match: {
                assignedUser: new mongoose.Types.ObjectId(user._id),
              },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          workloadStats: [
            {
              $match: { status: { $ne: 'done' }, assignedUser: { $ne: null } },
            },
            { $group: { _id: '$assignedUser', tasks: { $sum: 1 } } },
            { $sort: { tasks: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userData',
              },
            },
            { $unwind: '$userData' },
            {
              $project: {
                _id: 0,
                name: '$userData.name',
                tasks: 1,
              },
            },
          ],
          aiImpact: [{ $group: { _id: '$isAiGenerated', count: { $sum: 1 } } }],
          projectWiseStats: [
            {
              $group: {
                _id: '$project',
                total: { $sum: 1 },
                done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
                todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
                inProgress: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
                },
                inReview: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_review'] }, 1, 0] },
                },
                aiGenerated: {
                  $sum: { $cond: [{ $eq: ['$isAiGenerated', true] }, 1, 0] },
                },
                delayed: {
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
                atRisk: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'done'] },
                          { $gte: ['$dueDate', new Date()] },
                          {
                            $lt: [
                              '$dueDate',
                              new Date(
                                new Date().getTime() + 24 * 60 * 60 * 1000
                              ),
                            ],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                myTotal: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          '$assignedUser',
                          new mongoose.Types.ObjectId(user._id),
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                myDone: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $eq: [
                              '$assignedUser',
                              new mongoose.Types.ObjectId(user._id),
                            ],
                          },
                          { $eq: ['$status', 'done'] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                myDelayed: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $eq: [
                              '$assignedUser',
                              new mongoose.Types.ObjectId(user._id),
                            ],
                          },
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
        },
      },
    ]),
    Task.find({ project: { $in: projectIds } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('project', 'name')
      .lean(),
  ]);

  const raw = aggregationResult[0] || {
    overallStats: [],
    personalStats: [],
    workloadStats: [],
    aiImpact: [],
    projectWiseStats: [],
  };

  const workload = raw.workloadStats || [];

  const aiImpactRaw = raw.aiImpact || [];
  const aiStats = {
    ai: aiImpactRaw.find((a) => a._id === true)?.count || 0,
    manual: aiImpactRaw.find((a) => a._id === false)?.count || 0,
  };

  const statusStats = raw.overallStats || [];
  const personalRaw = raw.personalStats || [];
  const projectStats = raw.projectWiseStats || [];

  const stats = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    total: 0,
  };

  const personal = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    active: 0,
    completed: 0,
    total: 0,
  };

  statusStats.forEach((s) => {
    stats[s._id] = s.count;
    stats.total += s.count;
  });

  personalRaw.forEach((s) => {
    if (['todo', 'in_progress', 'in_review', 'done'].includes(s._id)) {
      personal[s._id] = s.count;
    }

    if (s._id === 'done') personal.completed += s.count;
    else personal.active += s.count;
    personal.total += s.count;
  });

  const enrichedProjects = projects.map((p) => {
    const pStat = projectStats.find(
      (ps) => ps._id.toString() === p._id.toString()
    ) || {
      total: 0,
      done: 0,
      todo: 0,
      inProgress: 0,
      inReview: 0,
      aiGenerated: 0,
      delayed: 0,
      atRisk: 0,
      myTotal: 0,
      myDone: 0,
      myDelayed: 0,
    };

    const percentage =
      pStat.total > 0 ? Math.round((pStat.done / pStat.total) * 100) : 0;

    const progressScore = percentage * 0.5;

    const pendingTasks = pStat.todo + pStat.inProgress;
    const pendingScore =
      pStat.total > 0 ? (1 - pendingTasks / pStat.total) * 100 * 0.3 : 30; 

    const delayImpact = (pStat.delayed + pStat.atRisk * 0.5) / pStat.total;
    const delayScore = pStat.total > 0 ? (1 - delayImpact) * 100 * 0.2 : 20;

    const healthScore =
      pStat.total > 0
        ? Math.round(progressScore + pendingScore + delayScore)
        : 100;

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
      riskLevel:
        healthScore < 50 || pStat.delayed > 5
          ? 'High'
          : healthScore < 80 || pStat.delayed > 2
            ? 'Medium'
            : 'Low',
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      members: p.members,
      myTasksTotal: pStat.myTotal,
      myTasksCompleted: pStat.myDone,
      myTasksDelayed: pStat.myDelayed,
      myPercentage:
        pStat.myTotal > 0
          ? Math.round((pStat.myDone / pStat.myTotal) * 100)
          : 0,
      sprint: p.sprint,
    };
  });


  return {
    summary: stats,
    personal,
    workload: workload,
    aiImpact: aiStats,
    projects: enrichedProjects,
    recentActivity,
  };
};

module.exports = {
  getDashboardStats,
};
