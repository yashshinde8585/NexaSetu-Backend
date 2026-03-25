const Task = require('../models/Task');
const Project = require('../models/Project');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { calculateDelayStatus } = require('../utils/taskUtils');

// Create new task in a project
exports.createTask = async (req, res) => {
  try {
    const { title, description, project, assignedUser, status, source, isAiGenerated, dueDate } = req.body;

    // Check if project exists and user is member
    const projectDoc = await Project.findOne({ _id: project, members: req.user.id });
    if (!projectDoc) {
      return res.status(404).json({ status: 'fail', message: 'Project not found or you are not a member' });
    }

    const taskData = {
      title,
      description,
      project,
      assignedUser: assignedUser || null,
      status: status || 'todo',
      source: source || 'manual',
      isAiGenerated: isAiGenerated || false,
      dueDate: dueDate || null,
    };

    // Initial lifecycle timestamps
    if (taskData.status === 'in_progress') {
      taskData.startedAt = new Date();
    } else if (taskData.status === 'done') {
      taskData.startedAt = taskData.startedAt || new Date();
      taskData.completedAt = new Date();
      taskData.actualDuration = 0;
    }

    const task = await Task.create(taskData);

    // 🧠 Emit Event to Agent Orchestrator
    await AgentOrchestrator.handleEvent({
        type: 'TASK_CREATED',
        entityId: task._id,
        entityType: 'task',
        project: task.project,
        payload: task
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

    const enrichedTasks = tasks.map(t => {
      const delayStatus = calculateDelayStatus(t);
      return { ...t.toObject(), delayStatus };
    });

    res.status(200).json({
      status: 'success',
      results: tasks.length,
      data: { tasks: enrichedTasks },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

// Update task details
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, assignedUser, dueDate } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ status: 'fail', message: 'Task not found' });
    }

    const project = await Project.findOne({ _id: task.project, members: req.user.id });
    if (!project) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    const updateData = { title, description, assignedUser, dueDate };

    if (status && status !== task.status) {
      updateData.status = status;
      
      // Started work
      if (status === 'in_progress' && !task.startedAt) {
        updateData.startedAt = new Date();
      }
      
      // Finished work
      if (status === 'done') {
        updateData.completedAt = new Date();
        const start = task.startedAt || task.createdAt;
        updateData.actualDuration = Math.round((new Date() - start) / (1000 * 60)); // Record in minutes
      }
      
      // Re-opened task
      if (status !== 'done' && task.status === 'done') {
        updateData.completedAt = null;
        updateData.actualDuration = null;
      }
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      updateData,
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

