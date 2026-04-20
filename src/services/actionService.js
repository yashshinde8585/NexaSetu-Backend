const ActionRequest = require('../models/ActionRequest');
const Project = require('../models/Project');
const actionExecutor = require('./actionExecutor');
const { getProjectAccessQuery } = require('../utils/queryHelpers');

class ActionService {
  async getPendingActions(user) {
    const projects = await Project.find(getProjectAccessQuery(user));
    const projectIds = projects.map((p) => p._id);

    // Retrieve unresolved action items targeting the authorized portfolios.
    // Assuming we should filter by projectIds, though original code didn't use projectIds in ActionRequest query.
    // Original: const actions = await ActionRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).populate('targetId');
    const actions = await ActionRequest.find({
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .populate('targetId');

    return actions;
  }

  async approveAction(actionId, userId) {
    return await actionExecutor.approveRequest(actionId, userId);
  }

  async rejectAction(actionId, userId) {
    const action = await ActionRequest.findByIdAndUpdate(actionId, {
      status: 'rejected',
      executedAt: new Date(),
      createdBy: userId,
    });
    return action;
  }
}

module.exports = new ActionService();
