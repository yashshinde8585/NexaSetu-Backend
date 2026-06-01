const AppError = require('../../utils/appError');

const updateTaskTimeTracking = (task, newStatus) => {
  const now = new Date();
  const isCurrentlyActive = task.status === 'in_progress' && !task.blocked;
  const willBeActive = newStatus === 'in_progress';

  if (isCurrentlyActive && !willBeActive && task.lastStartedAt) {
    const elapsedMinutes = Math.max(
      0,
      (now - task.lastStartedAt) / (1000 * 60)
    );
    task.remainingDuration = Math.max(
      0,
      (task.remainingDuration || task.estimatedDuration) - elapsedMinutes
    );
    task.lastStartedAt = null;
  }

  if (willBeActive && !isCurrentlyActive) {
    task.lastStartedAt = now;
    if (
      task.remainingDuration === undefined ||
      task.remainingDuration === null
    ) {
      task.remainingDuration = task.estimatedDuration;
    }
  }

  if (newStatus === 'done') {
    task.remainingDuration = 0;
    task.completedAt = now;

    const start = task.startedAt || task.createdAt;
    task.actualDuration = Math.round((now - start) / (1000 * 60));
  }
};

module.exports = {
  updateTaskTimeTracking,
};
