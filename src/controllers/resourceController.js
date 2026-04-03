const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const { getProjectAccessQuery } = require('../utils/queryHelpers');

// Evaluates team utilization and capacity to detect overarching organizational bottlenecks.
exports.getResourceWorkload = async (req, res) => {
  try {
    // Evaluate base capacity utilizing authorized project lists.
    const managerProjects = await Project.find(getProjectAccessQuery(req.user));

    const managerProjectIds = managerProjects.map((p) => p._id);

    // Identify distinct resources deployed across active projects.
    const teamMemberIds = [
      ...new Set(managerProjects.flatMap((p) => p.members)),
    ];

    // Measure overall systemic load dynamically.
    const activeTasks = await Task.find({
      assignedUser: { $in: teamMemberIds },
      status: { $in: ['todo', 'in_progress'] },
    }).populate('project', 'name');

    // Aggregate uncompleted items per individual team member.
    const userWorkloadMap = {};

    teamMemberIds.forEach((userId) => {
      userWorkloadMap[userId.toString()] = {
        userId: userId,
        activeTasks: [],
        taskCount: 0,
        projectCount: new Set(),
      };
    });

    activeTasks.forEach((task) => {
      const userIdStr = task.assignedUser.toString();
      if (userWorkloadMap[userIdStr]) {
        userWorkloadMap[userIdStr].activeTasks.push(task);
        userWorkloadMap[userIdStr].taskCount += 1;
        userWorkloadMap[userIdStr].projectCount.add(
          task.project._id.toString()
        );
      }
    });

    // Append identifying attributes to active team IDs.
    const users = await User.find(
      { _id: { $in: teamMemberIds } },
      'name email'
    );

    // Synthesize raw totals into categorized diagnostic health statuses.
    const workloadData = users.map((user) => {
      const stats = userWorkloadMap[user._id.toString()] || {
        taskCount: 0,
        projectCount: new Set(),
      };
      const activeCount = stats.taskCount;
      const projectsCount = stats.projectCount.size;

      let status = 'Normal';
      if (activeCount >= 6) status = 'Overloaded';
      else if (activeCount >= 3) status = 'Warning';

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        activeTasksCount: activeCount,
        projectsCount,
        workloadStatus: status,
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        resources: workloadData.sort(
          (a, b) => b.activeTasksCount - a.activeTasksCount
        ),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({
        status: 'error',
        message: 'Failed to calculate resource workload',
      });
  }
};
