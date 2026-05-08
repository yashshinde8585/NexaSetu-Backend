const ActionRequest = require('../models/ActionRequest');
const Project = require('../models/Project');
const actionExecutor = require('./actionExecutor');
const { getProjectAccessQuery } = require('../utils/queryHelpers');

const getPendingActions = async (user) => {
  const projects = await Project.find(getProjectAccessQuery(user));
  const projectIds = projects.map((p) => p._id);

  // Retrieve unresolved action items targeting the authorized portfolios.
  const actions = await ActionRequest.find({
    status: 'pending',
  })
    .sort({ createdAt: -1 })
    .populate('targetId');

  return actions;
};

const approveAction = async (actionId, userId) => {
  return await actionExecutor.approveRequest(actionId, userId);
};

const rejectAction = async (actionId, userId) => {
  const action = await ActionRequest.findByIdAndUpdate(actionId, {
    status: 'rejected',
    executedAt: new Date(),
    createdBy: userId,
  });
  return action;
};

module.exports = {
  getPendingActions,
  approveAction,
  rejectAction
};
