const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { calculateDelayStatus } = require('../utils/taskUtils');
const { isManagerOrAdmin } = require('../utils/authHelpers');
const { getTaskAccessQuery, getProjectAccessQuery } = require('../utils/queryHelpers');
const catchAsync = require('../utils/catchAsync');

// Create new task in a project
exports.createTask = catchAsync(async (req, res, next) => {
    const { title, description, project, assignedUser, status, source, isAiGenerated, dueDate, sprint } = req.body;

    const query = getProjectAccessQuery(req.user);
    query._id = project;
    const projectDoc = await Project.findOne(query);
    if (!projectDoc) {
      return res.status(404).json({ status: 'fail', message: 'Project not found or you are not a member' });
    }

    const taskData = {
      title,
      description,
      project,
      sprint,
      assignedUser: assignedUser || null,
      status: status || 'todo',
      source: source || 'manual',
      isAiGenerated: isAiGenerated || false,
      dueDate: dueDate || null,
      createdBy: req.user._id,
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
});

// Get all tasks for a project
exports.getTasks = catchAsync(async (req, res, next) => {
    const { projectId } = req.params;
    const { sprintId } = req.query;
    
    const projectQuery = getProjectAccessQuery(req.user);
    projectQuery._id = projectId;
    const project = await Project.findOne(projectQuery);
    if (!project) {
      return res.status(404).json({ status: 'fail', message: 'Project not found or access denied' });
    }

    const pipeline = [
      { $match: { project: new mongoose.Types.ObjectId(projectId) } }
    ];

    if (sprintId) {
        const sprintObjectId = new mongoose.Types.ObjectId(sprintId);
        const projectSprintId = project.sprint ? (project.sprint._id || project.sprint).toString() : null;
        
        const sprintMatch = { $or: [{ sprint: sprintObjectId }] };
        
        // If viewing the project's current sprint, also include unassigned tasks
        if (projectSprintId === sprintId) {
            sprintMatch.$or.push(
                { sprint: { $exists: false } },
                { sprint: null }
            );
        }
        
        pipeline.push({ $match: sprintMatch });
    }

    // Add User and Sprint Lookup
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'assignedUser',
          foreignField: '_id',
          as: 'assignedUserData'
        }
      },
      {
        $lookup: {
          from: 'sprints',
          localField: 'sprint',
          foreignField: '_id',
          as: 'sprintData'
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $addFields: {
          assignedUser: { $arrayElemAt: ['$assignedUserData', 0] },
          projectKey: project.key || 'NEXA',
          sprintInfo: { $arrayElemAt: ['$sprintData', 0] }
        }
      },
      {
        $project: {
          assignedUserData: 0,
          sprintData: 0
        }
      }
    );

    const tasks = await Task.aggregate(pipeline);

    const enrichedTasks = tasks.map(t => {
      const delayStatus = calculateDelayStatus(t);
      return { ...t, delayStatus };
    });

    res.status(200).json({
      status: 'success',
      results: enrichedTasks.length,
      data: { tasks: enrichedTasks },
    });
});

// Update task details
exports.updateTask = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { title, description, status, assignedUser, dueDate } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ status: 'fail', message: 'Task not found' });
    }

    const query = getProjectAccessQuery(req.user);
    query._id = task.project;
    const project = await Project.findOne(query);
    if (!project) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    const updateData = { title, description, assignedUser, dueDate };

    if (status && status !== task.status) {
      updateData.status = status;
      
      if (status === 'in_progress' && !task.startedAt) {
        updateData.startedAt = new Date();
      }
      
      if (status === 'done') {
        updateData.completedAt = new Date();
        const start = task.startedAt || task.createdAt;
        updateData.actualDuration = Math.round((new Date() - start) / (1000 * 60)); // Record in minutes
      }
      
      if (status !== 'done' && task.status === 'done') {
        updateData.completedAt = null;
        updateData.actualDuration = null;
      }
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    ).populate('assignedUser', 'name email');

    // 🧠 Emit Update Event to Agent Orchestrator
    await AgentOrchestrator.handleEvent({
        type: 'TASK_UPDATED',
        entityId: updatedTask._id,
        entityType: 'task',
        project: updatedTask.project,
        payload: updatedTask
    });

    res.status(200).json({
      status: 'success',
      data: { task: updatedTask },
    });
});

// Get all tasks assigned to the current user
exports.getMyTasks = catchAsync(async (req, res, next) => {
    const tasks = await Task.find({ 
      assignedUser: req.user._id
    }).sort('-completedAt -updatedAt').populate('project', 'name');

    const enrichedTasks = tasks.map(t => {
      const delayStatus = calculateDelayStatus(t);
      return { ...t.toObject(), delayStatus };
    });

    res.status(200).json({
      status: 'success',
      results: enrichedTasks.length,
      data: { tasks: enrichedTasks },
    });
});
