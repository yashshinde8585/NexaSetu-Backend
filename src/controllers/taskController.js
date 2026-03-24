const Task = require('../models/Task');
const Project = require('../models/Project');

// Create new task in a project
exports.createTask = async (req, res) => {
  try {
    const { title, description, project, assignedUser, status, source, isAiGenerated } = req.body;

    // Check if project exists and user is member
    const projectDoc = await Project.findOne({ _id: project, members: req.user.id });
    if (!projectDoc) {
      return res.status(404).json({ status: 'fail', message: 'Project not found or you are not a member' });
    }

    const task = await Task.create({
      title,
      description,
      project,
      assignedUser: assignedUser || null,
      status: status || 'todo',
      source: source || 'manual',
      isAiGenerated: isAiGenerated || false,
    });

    res.status(201).json({
      status: 'success',
      data: { task },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

// Get all tasks for a project
exports.getTasks = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check project member access
    const project = await Project.findOne({ _id: projectId, members: req.user.id });
    if (!project) {
      return res.status(404).json({ status: 'fail', message: 'Project not found or access denied' });
    }

    const tasks = await Task.find({ project: projectId }).populate('assignedUser', 'name email');

    res.status(200).json({
      status: 'success',
      results: tasks.length,
      data: { tasks },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

// Update task details
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, assignedUser } = req.body;

    // Find the task and check if it belongs to a project the user is a member of
    const task = await Task.findById(id).populate('project');
    if (!task) {
      return res.status(404).json({ status: 'fail', message: 'Task not found' });
    }

    const project = await Project.findOne({ _id: task.project._id, members: req.user.id });
    if (!project) {
      return res.status(403).json({ status: 'fail', message: 'You are not a member of this project' });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { title, description, status, assignedUser },
      { new: true, runValidators: true }
    ).populate('assignedUser', 'name email');

    res.status(200).json({
      status: 'success',
      data: { task: updatedTask },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};
