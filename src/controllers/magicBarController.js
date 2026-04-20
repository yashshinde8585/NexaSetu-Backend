const magicBarService = require('../services/magicBarService');
const catchAsync = require('../utils/catchAsync');

// Drives the conversational Magic Bar interface by interpreting queries and executing AI-mapped actions.
exports.executeMagicCommand = catchAsync(async (req, res, next) => {
  const result = await magicBarService.executeMagicCommand(req.user, req.body.query, req.body.context);

  res.status(200).json({
    status: 'success',
    data: {
      actions: result.actions,
      actionTriggered: result.actionTriggered,
    },
  });
});
