const ActionRequest = require('../models/ActionRequest');
const Project = require('../models/Project');
const actionExecutor = require('../services/actionExecutor');
const auditService = require('../services/auditService');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const catchAsync = require('../utils/catchAsync');

// Processes AI-driven action requests, managing administrative approvals and rejections.
exports.getPendingActions = catchAsync(async (req, res, next) => {
  const projects = await Project.find(getProjectAccessQuery(req.user));
  const projectIds = projects.map((p) => p._id);

  // Retrieve unresolved action items targeting the authorized portfolios.
  const actions = await ActionRequest.find({
    status: 'pending',
  })
    .sort({ createdAt: -1 })
    .populate('targetId');

  res.status(200).json({
    status: 'success',
    data: { actions },
  });
});

exports.approveAction = catchAsync(async (req, res, next) => {
  const { actionId } = req.params;
  const result = await actionExecutor.approveRequest(actionId, req.user.id);

  await auditService.log({
    action: 'APPROVE_AI',
    req,
    entityType: 'AI_ACTION',
    entityId: actionId,
    details: { outcome: 'EXECUTED' },
  });

  res.status(200).json({
    status: 'success',
    message: 'Action approved and executed',
    data: result,
  });
});

exports.rejectAction = catchAsync(async (req, res, next) => {
  const { actionId } = req.params;
  const action = await ActionRequest.findByIdAndUpdate(actionId, {
    status: 'rejected',
    executedAt: new Date(),
    createdBy: req.user.id,
  });

  await auditService.log({
    action: 'REJECT_AI',
    req,
    entityType: 'AI_ACTION',
    entityId: actionId,
    details: { outcome: 'REJECTED' },
  });

  res.status(200).json({
    status: 'success',
    message: 'Action rejected',
  });
});
