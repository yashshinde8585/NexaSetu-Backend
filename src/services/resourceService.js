const Task = require('../models/Task');
const Project = require('../models/Project');

// Provides algorithmic load balancing and centralized telemetry for personnel capacities.

exports.getMemberWorkloads = async (projectId) => {
  const project = await Project.findById(projectId).populate(
    'members',
    'name email'
  );
  if (!project) return [];

  const workloads = await Task.aggregate([
    {
      $match: {
        project: project._id,
        status: { $in: ['todo', 'in_progress', 'in_review'] },
        assignedUser: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$assignedUser',
        taskCount: { $sum: 1 },
      },
    },
  ]);

  // Pad output logic with inactive members ensuring accurate 0-count baseline representations.
  return project.members
    .map((member) => {
      const workload = workloads.find(
        (w) => w._id.toString() === member._id.toString()
      );
      return {
        userId: member._id,
        name: member.name,
        taskCount: workload ? workload.taskCount : 0,
      };
    })
    .sort((a, b) => a.taskCount - b.taskCount);
};

exports.autoAssignTask = async (taskId) => {
  const task = await Task.findById(taskId).populate('project');
  if (!task || task.assignedUser) return null;

  const workloads = await exports.getMemberWorkloads(task.project._id);
  if (workloads.length === 0) return null;

  // Route dynamically to the first available operational vector.
  const bestCandidate = workloads[0];

  task.assignedUser = bestCandidate.userId;
  await task.save();

  return {
    taskId: task._id,
    assignedTo: bestCandidate.name,
    taskCount: bestCandidate.taskCount + 1,
  };
};

exports.generateDailyStandup = async (projectId) => {
  const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);

  // Pull cyclical task completions bounded by standard 24h intervals.
  const completedTasks = await Task.find({
    project: projectId,
    status: 'done',
    updatedAt: { $gte: yesterday },
  });

  // Extract high-risk items requiring imminent intervention.
  const atRiskTasks = await Task.find({
    project: projectId,
    status: { $ne: 'done' },
    dueDate: { $lt: new Date() },
  });

  // Mock AI formatting vectors while preparing the core telemetry payload.
  return {
    completed: completedTasks.length,
    atRisk: atRiskTasks.length,
    summary: `Yesterday, the team completed ${completedTasks.length} tasks. ${atRiskTasks.length} tasks are currently at risk.`,
  };
};
