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
  const sprint = await sprintService.getSprint(req.user, req.params.id);
  res.status(200).json({ status: 'success', data: { sprint } });
});

exports.updateSprint = catchAsync(async (req, res, next) => {
  const sprint = await sprintService.updateSprint(
    req.user,
    req.params.id,
    req.body
  );
  res.status(200).json({ status: 'success', data: { sprint } });
});

exports.deleteSprint = catchAsync(async (req, res, next) => {
  await sprintService.deleteSprint(req.user, req.params.id);
  res.status(204).json({ status: 'success', data: null });
});

exports.syncSprintHealth = catchAsync(async (req, res, next) => {
  const data = await sprintService.syncSprintHealth(req.user, req.params.id);
  res.status(200).json({ status: 'success', data });
});

exports.startSprint = catchAsync(async (req, res, next) => {
  const sprint = await sprintService.startSprint(req.user, req.params.id);
  res.status(200).json({ status: 'success', data: { sprint } });
});

exports.completeSprint = catchAsync(async (req, res, next) => {
  const result = await sprintService.completeSprint(
    req.user,
    req.params.id,
    req.body
  );
  res.status(200).json({ status: 'success', data: result });
});

exports.getSprintTasks = catchAsync(async (req, res, next) => {
  const data = await sprintService.getSprintTasks(
    req.user,
    req.params.id,
    req.query.includeBacklog === 'true'
  );
  res.status(200).json({ status: 'success', data });
});

exports.addTasksToSprint = catchAsync(async (req, res, next) => {
  const result = await sprintService.addTasksToSprint(
    req.user,
    req.params.id,
    req.body.taskIds
  );
  res.status(200).json({ status: 'success', data: result });
});

exports.removeTaskFromSprint = catchAsync(async (req, res, next) => {
  const result = await sprintService.removeTaskFromSprint(
    req.user,
    req.params.id,
    req.params.taskId
  );
  res.status(200).json({ status: 'success', data: result });
});

exports.getSprintBurndown = catchAsync(async (req, res, next) => {
  const data = await sprintService.getSprintBurndown(req.user, req.params.id);
  res.status(200).json({ status: 'success', data });
});

exports.getAiSprintPlanning = catchAsync(async (req, res, next) => {
  const data = await sprintService.getAiSprintPlanning(req.user, req.params.id);
  res.status(200).json({ status: 'success', data });
});

exports.getAiSprintHealth = catchAsync(async (req, res, next) => {
  const data = await sprintService.getAiSprintHealth(req.user, req.params.id);
  res.status(200).json({ status: 'success', data });
});
