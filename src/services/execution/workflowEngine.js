const logger = require('../../utils/logger');

const onTaskCreated = async (task) => {
  // TL workflow rules
  if (!task.assignee && task.teamId) {
    // Auto-assign based on workload (mock logic)
    logger.info(`[Workflow] Task ${task._id} auto-assignment triggered.`);
  }
};

const onTaskStatusChanged = async (task, oldStatus, newStatus) => {
  logger.info(
    `[Workflow] Task ${task._id} moved from ${oldStatus} to ${newStatus}`
  );

  // E.g. notify QA if status is IN_REVIEW
  if (newStatus === 'IN_REVIEW') {
    logger.info(`[Workflow] Triggering QA assignment for task ${task._id}`);
  }
};

module.exports = {
  onTaskCreated,
  onTaskStatusChanged,
};
