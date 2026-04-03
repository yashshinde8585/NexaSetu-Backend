const Sprint = require('../models/Sprint');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Handles the creation, scheduling, and deletion of synchronized operational sprints.
exports.createSprint = catchAsync(async (req, res, next) => {
  const { name, startDate, endDate, status } = req.body;

  if (!name || !startDate || !endDate) {
    return next(
      new AppError('Please provide sprint name, start date and end date', 400)
    );
  }

  const sprint = await Sprint.create({
    name,
    startDate,
    endDate,
    status: status || 'upcoming',
    workspaceId: req.user.workspaceId,
    createdBy: req.user._id,
  });

  res.status(201).json({
    status: 'success',
    data: {
      sprint,
    },
  });
});

exports.getAllSprints = catchAsync(async (req, res, next) => {
  const sprints = await Sprint.find({ workspaceId: req.user.workspaceId }).sort(
    { startDate: 1 }
  );

  res.status(200).json({
    status: 'success',
    results: sprints.length,
    data: {
      sprints,
    },
  });
});

exports.getSprint = catchAsync(async (req, res, next) => {
  const sprint = await Sprint.findOne({
    _id: req.params.id,
    workspaceId: req.user.workspaceId,
  });

  if (!sprint) {
    return next(
      new AppError('No sprint found with that ID in your workspace', 404)
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      sprint,
    },
  });
});

exports.updateSprint = catchAsync(async (req, res, next) => {
  const sprint = await Sprint.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.user.workspaceId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!sprint) {
    return next(
      new AppError('No sprint found with that ID in your workspace', 404)
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      sprint,
    },
  });
});

exports.deleteSprint = catchAsync(async (req, res, next) => {
  const sprint = await Sprint.findOneAndDelete({
    _id: req.params.id,
    workspaceId: req.user.workspaceId,
  });

  if (!sprint) {
    return next(
      new AppError('No sprint found with that ID in your workspace', 404)
    );
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
