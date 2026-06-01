const TaskService = require('../services/execution/taskService');
const SprintService = require('../services/execution/sprintService');

exports.createTask = async (req, res, next) => {
  try {
    const task = await TaskService.createTask(req.body, req.user._id);
    res.status(201).json({ status: 'success', data: { task } });
  } catch (err) {
    next(err);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const task = await TaskService.updateTask(req.params.id, req.body);
    res.status(200).json({ status: 'success', data: { task } });
  } catch (err) {
    next(err);
  }
};

exports.getTasks = async (req, res, next) => {
  try {
    // req.scopedTeams comes from enforceScope middleware
    const tasks = await TaskService.getTasks(req.query, req.scopedTeams);
    res.status(200).json({ status: 'success', data: { tasks } });
  } catch (err) {
    next(err);
  }
};

exports.createSprint = async (req, res, next) => {
  try {
    const sprint = await SprintService.createSprint(req.body, req.user._id);
    res.status(201).json({ status: 'success', data: { sprint } });
  } catch (err) {
    next(err);
  }
};
