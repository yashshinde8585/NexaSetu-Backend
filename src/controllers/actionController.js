const ActionRequest = require('../models/ActionRequest');
const Project = require('../models/Project');
const actionExecutor = require('../services/actionExecutor');

/**
 * Controller for managing AI Action Approvals
 */

exports.getPendingActions = async (req, res) => {
  try {
    const projects = await Project.find({ members: req.user.id });
    const projectIds = projects.map(p => p._id);

    // Fetch pending actions targeting tasks in these projects
    const actions = await ActionRequest.find({
      status: 'pending'
    })
    .sort({ createdAt: -1 })
    .populate('targetId');

    res.status(200).json({
      status: 'success',
      data: { actions }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch pending actions' });
  }
};

exports.approveAction = async (req, res) => {
  try {
    const { actionId } = req.params;
    const result = await actionExecutor.approveRequest(actionId, req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Action approved and executed',
      data: result
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

exports.rejectAction = async (req, res) => {
  try {
    const { actionId } = req.params;
    const action = await ActionRequest.findByIdAndUpdate(actionId, { 
        status: 'rejected',
        executedAt: new Date(),
        createdBy: req.user.id 
    });

    res.status(200).json({
      status: 'success',
      message: 'Action rejected'
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};
