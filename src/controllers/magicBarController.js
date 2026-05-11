const magicBarService = require('../services/magicBarService');
const catchAsync = require('../utils/catchAsync');

exports.executeMagicCommand = catchAsync(async (req, res, next) => {
  const controller = new AbortController();
  
  req.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  const result = await magicBarService.executeMagicCommand(req.user, req.body.query, req.body.context);

  res.status(result.status === 'processing' ? 202 : 200).json({
    status: 'success',
    data: {
      actions: result.actions,
      actionTriggered: result.actionTriggered,
      jobId: result.jobId,
      message: result.message
    },
  });
});
