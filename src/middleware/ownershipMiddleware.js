const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');

/**
 * Resource isolation guard.
 * Verifies that the requester has legitimate access to a specific record based on ownership or workspace membership.
 */
const verifyOwnership = (Model, idParamName = 'id', ownerField = 'workspaceId') => {
  return catchAsync(async (req, res, next) => {
    const resourceId = req.params[idParamName];

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return next(new AppError('Invalid resource ID format', 400));
    }

    const resource = await Model.findById(resourceId);

    if (!resource) {
      return next(new AppError('Resource not found', 404));
    }

    // 1. Check if resource is directly owned by user
    const isOwner = resource.userId && resource.userId.toString() === req.user._id.toString();
    
    // 2. Check if resource belongs to user's workspace
    const belongsToWorkspace = resource[ownerField] && resource[ownerField].toString() === req.user.workspaceId.toString();

    // 3. Admin bypass
    const isAdmin = req.user.role === 'WORKSPACE_ADMIN';

    if (!isOwner && !belongsToWorkspace && !isAdmin) {
      return next(new AppError('Access Denied: You do not have permission to access this resource', 403));
    }

    // Attach resource to req for optimization in the controller
    req.resource = resource;
    next();
  });
};

module.exports = { verifyOwnership };
