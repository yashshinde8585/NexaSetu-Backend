const metricsService = require('../metricsService');
const logger = require('../../utils/logger');

const trackTaskTransition = (user, taskId, fromStatus, toStatus) => {
  metricsService
    .trackEvent(user, 'task_state_transition', {
      taskId,
      from: fromStatus,
      to: toStatus,
    })
    .catch((err) =>
      logger.error(`[METRICS] Failed to track task transition: ${err.message}`)
    );
};

const trackTaskCreation = (user, taskId, projectId) => {
  metricsService
    .trackEvent(user, 'task_created', {
      taskId,
      projectId,
    })
    .catch((err) =>
      logger.error(`[METRICS] Failed to track task creation: ${err.message}`)
    );
};

module.exports = {
  trackTaskTransition,
  trackTaskCreation,
};
