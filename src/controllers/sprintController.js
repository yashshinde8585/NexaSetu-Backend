const sprintService = require('../services/sprintService');
const catchAsync = require('../utils/catchAsync');

exports.createSprint = catchAsync(async (req, res, next) => {
  const sprint = await sprintService.createSprint(req.user, req.body);
  res.status(201).json({ status: 'success', data: { sprint } });
});

exports.getAllSprints = catchAsync(async (req, res, next) => {
  const sprints = await sprintService.getAllSprints(
    req.user,
    req.query.project
  );
  res
    .status(200)
    .json({ status: 'success', results: sprints.length, data: { sprints } });
});

exports.getSprint = catchAsync(async (req, res, next) => {
  const sprint = await sprintService.getSprint(req.params.id);
  res.status(200).json({ status: 'success', data: { sprint } });
});

exports.updateSprint = catchAsync(async (req, res, next) => {
  const sprint = await sprintService.updateSprint(req.params.id, req.body);
  res.status(200).json({ status: 'success', data: { sprint } });
});

exports.deleteSprint = catchAsync(async (req, res, next) => {
  await sprintService.deleteSprint(req.params.id);
  res.status(204).json({ status: 'success', data: null });
});

exports.syncSprintHealth = catchAsync(async (req, res, next) => {
  const data = await sprintService.syncSprintHealth(req.params.id);
  res.status(200).json({ status: 'success', data });
});
