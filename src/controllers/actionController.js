const actionService = require('../services/actionService');
const auditService = require('../services/auditService');
const catchAsync = require('../utils/catchAsync');

// Processes AI-driven action requests, managing administrative approvals and rejections.
exports.getPendingActions = catchAsync(async (req, res, next) => {
  const actions = await actionService.getPendingActions(req.user);

  res.status(200).json({
    status: 'success',
    data: { actions },
  });
});

exports.approveAction = catchAsync(async (req, res, next) => {
  const { actionId } = req.params;
  const result = await actionService.approveAction(actionId, req.user.id);

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
  const action = await actionService.rejectAction(actionId, req.user.id);

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
