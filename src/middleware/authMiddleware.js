const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const config = require('../config/config');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { mapRole } = require('../utils/authHelpers');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

// Middleware to protect routes and ensure user is authenticated
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Extract token from authorization header or cookies
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  // Verify the JWT token signature and expiration
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }

  // Verify that the user still exists in the system
  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  // Check if password was changed after the token was issued
  if (user.passwordChangedAt) {
    const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
    if (decoded.iat < changedTimestamp) {
      return next(new AppError('User recently changed password! Please log in again.', 401));
    }
  }

  // Recover missing workspace context automatically
  if (!user.workspaceId && req.method !== 'GET') {
    const workspace = await Workspace.findOne({
      $or: [{ admin: user._id }, { owner: user._id }],
    }).select('_id');
    
    if (workspace) {
      user.workspaceId = workspace._id;
      await User.updateOne({ _id: user._id }, { workspaceId: workspace._id });
    }
  }

  req.user = user;
  next();
});

// Middleware for permission-based authorization
exports.requirePermission = (requiredPermission) => (req, res, next) => {
  const effectiveRole = mapRole(req.user.role);
  const permissions = ROLE_PERMISSIONS[effectiveRole] || [];

  if (permissions.includes('*') || permissions.includes(requiredPermission)) {
    logger.info(`[AUTH] Permission granted: user=${req.user._id} role=${req.user.role} permission=${requiredPermission}`);
    return next();
  }

  logger.warn(`[AUTH] Permission denied: user=${req.user._id} role=${req.user.role} required=${requiredPermission}`);
  next(new AppError('You lack the required permissions for this action.', 403));
};

// Middleware for role-based authorization
exports.restrictTo = (...roles) => (req, res, next) => {
  const hasRole = roles.includes(req.user.role);
  const hasJobTitle = roles.some(role => 
    req.user.jobTitle?.replace(' ', '_').toUpperCase() === role
  );

  if (!hasRole && !hasJobTitle) {
    logger.warn(`[AUTH] Role denied: user=${req.user._id} role=${req.user.role} jobTitle=${req.user.jobTitle} allowed=${roles.join(',')}`);
    return next(new AppError('You do not have permission to perform this action', 403));
  }
  
  logger.info(`[AUTH] Role granted: user=${req.user._id} role=${req.user.role} endpoint=${req.originalUrl}`);
  next();
};
