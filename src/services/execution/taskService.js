const Task = require('../../models/Task');
const MetricsService = require('../observability/metricsService');
const WorkflowEngine = require('./workflowEngine');

const createTask = async (data, creatorId) => {
  const task = new Task({ ...data, createdBy: creatorId });
  await task.save();

  // Workflow Engine hooks
  await WorkflowEngine.onTaskCreated(task);

  // Observability hooks
  await MetricsService.recordMetric(
    'task_created',
    1,
    task.workspaceId,
    task.teamId
  );

  return task;
};

const updateTask = async (id, updates) => {
  const oldTask = await Task.findById(id);
  const task = await Task.findByIdAndUpdate(id, updates, { new: true });

  if (updates.status && updates.status !== oldTask.status) {
    await WorkflowEngine.onTaskStatusChanged(task, oldTask.status, task.status);

    if (task.status === 'DONE' || task.status === 'COMPLETED') {
      await MetricsService.recordMetric(
        'task_completed',
        1,
        task.workspaceId,
        task.teamId
      );
      // re-calculate team velocity/completion rate
      if (task.teamId) {
        await MetricsService.calculateTaskCompletionRate(task.teamId);
      }
    }
  }

  return task;
};

const getTasks = async (filters, scopedTeams) => {
  const query = { ...filters };

  // Scoped Data Enforcement
  if (scopedTeams && scopedTeams.length > 0) {
    query.teamId = { $in: scopedTeams };
  }

  return Task.find(query).populate('assignee').sort({ createdAt: -1 });
};

module.exports = {
  createTask,
  updateTask,
  getTasks,
};
