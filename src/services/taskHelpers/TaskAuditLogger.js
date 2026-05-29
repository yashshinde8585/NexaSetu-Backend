const auditService = require('../auditService');

const logTaskUpdate = async (user, taskId, oldData, newData, req) => {
  await auditService.logUpdate(user, 'TASK', taskId, oldData, newData, req);
};

const logTaskCreation = async (user, taskId, data) => {
  await auditService.log({
    action: 'CREATE_TASK',
    user,
    entityType: 'TASK',
    entityId: taskId,
    details: data,
  });
};

module.exports = {
  logTaskUpdate,
  logTaskCreation,
};
