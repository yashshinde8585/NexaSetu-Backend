const strategicIntentService = require('../services/strategicIntentService');
const catchAsync = require('../utils/catchAsync');

exports.getStrategicHub = catchAsync(async (req, res, next) => {
  const result = await strategicIntentService.getStrategicHub(req.params.projectId);

  res.status(200).json({
    success: true,
    data: result
  });
});

exports.generateFromIntent = catchAsync(async (req, res, next) => {
  const stories = await strategicIntentService.generateStoriesFromIntent(req.body.intentId, req.user._id);

  res.status(201).json({
    success: true,
    message: `${stories.length} stories generated from Intent`,
    data: stories
  });
});

exports.updateStrategicAlignment = catchAsync(async (req, res, next) => {
  const task = await strategicIntentService.updateStrategicAlignment(req.params.taskId, req.body.strategicWeight, req.body.storyPoints);

  res.status(200).json({
    success: true,
    data: task
  });
});

exports.getDependencyGraph = catchAsync(async (req, res, next) => {
  const result = await strategicIntentService.getDependencyGraph(req.query.projectId);

  res.status(200).json({
    success: true,
    data: result
  });
});
