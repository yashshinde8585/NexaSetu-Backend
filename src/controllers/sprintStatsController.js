const sprintStatsService = require('../services/sprintStatsService');
const catchAsync = require('../utils/catchAsync');

exports.finalizeSprint = catchAsync(async (req, res, next) => {
  const data = await sprintStatsService.finalizeSprint(req.user, req.params.id);
  res.status(200).json({ status: 'success', data });
});

exports.getSprintStats = catchAsync(async (req, res, next) => {
  const data = await sprintStatsService.getSprintStats(req.user, req.params.id);
  res.status(200).json({ status: 'success', data: data || null });
});

exports.getSprintReportData = catchAsync(async (req, res, next) => {
  const data = await sprintStatsService.getSprintReportData(
    req.user,
    req.params.id
  );
  res.status(200).json({ status: 'success', data });
});
