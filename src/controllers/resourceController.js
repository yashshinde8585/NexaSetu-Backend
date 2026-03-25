const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');

/**
 * Controller for resource workload and conflict detection
 */

exports.getResourceWorkload = async (req, res) => {
  try {
    // 1. Get all projects the manager is a member of
    const managerProjects = await Project.find({
      members: req.user.id
    });

    const managerProjectIds = managerProjects.map(p => p._id);
    
    // 2. Identify all team members across these projects
    const teamMemberIds = [...new Set(managerProjects.flatMap(p => p.members))];

    // 3. For these team members, fetch all active tasks across the system
    // (We want to catch cross-project overload)
    const activeTasks = await Task.find({
      assignedUser: { $in: teamMemberIds },
      status: { $in: ['todo', 'in_progress'] }
    }).populate('project', 'name');

    // 4. Calculate workload per user
    const userWorkloadMap = {};

    teamMemberIds.forEach(userId => {
      userWorkloadMap[userId.toString()] = {
        userId: userId,
        activeTasks: [],
        taskCount: 0,
        projectCount: new Set()
      };
    });

    activeTasks.forEach(task => {
      const userIdStr = task.assignedUser.toString();
      if (userWorkloadMap[userIdStr]) {
        userWorkloadMap[userIdStr].activeTasks.push(task);
        userWorkloadMap[userIdStr].taskCount += 1;
        userWorkloadMap[userIdStr].projectCount.add(task.project._id.toString());
      }
    });

    // 5. Fetch user names for display
    const users = await User.find({ _id: { $in: teamMemberIds } }, 'name email');

    // 6. Enrich and categorize
    const workloadData = users.map(user => {
      const stats = userWorkloadMap[user._id.toString()] || { taskCount: 0, projectCount: new Set() };
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
        resources: workloadData.sort((a, b) => b.activeTasksCount - a.activeTasksCount)
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to calculate resource workload' });
  }
};
