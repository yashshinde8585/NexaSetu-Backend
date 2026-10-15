const commentService = require('../services/commentService');
const catchAsync = require('../utils/catchAsync');

// Fetches the chronological discussion feed and activity log for a specific mission identifier.
exports.getTaskComments = catchAsync(async (req, res, next) => {
  const result = await commentService.getTaskComments(req.params.taskId);

  res.status(200).json({
    status: 'success',
    source: result.source,
    results: result.comments.length,
    data: { comments: result.comments },
  });
});

// Appends a new user comment to the task feed and notifies relevant mission stakeholders.
exports.addComment = catchAsync(async (req, res, next) => {
  const comment = await commentService.addComment(
    req.user,
    req.params.taskId,
    req.body.content
  );

  res.status(201).json({
    status: 'success',
    data: { comment },
  });
});
