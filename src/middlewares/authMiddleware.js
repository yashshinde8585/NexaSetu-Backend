const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const config = require('../config/config');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { mapRole } = require('../utils/authHelpers');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { createClerkClient } = require('@clerk/clerk-sdk-node');
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const {
  getRedisClient,
  withTimeout,
  isRedisConnected,
} = require('../config/redis');

// Middleware to protect routes and ensure user is authenticated
exports.protect = catchAsync(async (req, res, next) => {
  const useClerk = process.env.USE_CLERK_AUTH === 'true';
  let token;
  let user;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (useClerk && req.cookies?.__session) {
    token = req.cookies.__session;
  } else if (!useClerk && req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('No token provided. Please log in.', 401));
  }

  // 1. Attempt to resolve from Session Cache (Redis)
  const redis = getRedisClient();
  const cacheKey = `session:user:${token.substring(token.length - 20)}`;

  if (isRedisConnected()) {
    const cachedUser = await withTimeout(redis.get(cacheKey), 500);
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
      return next();
    }
  }
  if (useClerk) {
    try {
      const decodedToken = await clerkClient.verifyToken(token);
      const userId = decodedToken.sub;

      user = await User.findOne({ clerkUserId: userId }).select('-password');

      if (!user) {
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        user = await User.findOne({ email }).select('-password');

        if (user) {
          user.clerkUserId = userId;
          await user.save();
        } else {
          return next(new AppError('User not found in local database.', 401));
        }
      }
    } catch (err) {
      return next(new AppError(`Invalid Clerk session: ${err.message}`, 401));
    }
  } else {
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return next(new AppError('Invalid or expired token.', 401));
    }

    user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(
        new AppError('The user belonging to this token no longer exists.', 401)
      );
    }

    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(
        user.passwordChangedAt.getTime() / 1000,
        10
      );
      if (decoded.iat < changedTimestamp) {
        return next(
          new AppError(
            'User recently changed password! Please log in again.',
            401
          )
        );
      }
    }
  }

  // Recover missing workspace context automatically
  if (!user.workspaceId) {
    const workspace = await Workspace.findOne({
      $or: [{ admin: user._id }, { owner: user._id }],
    }).select('_id');

    if (workspace) {
      user.workspaceId = workspace._id;
      await User.updateOne({ _id: user._id }, { workspaceId: workspace._id });
    }
  }

  // 3. Store in cache for subsequent requests (5 minute TTL)
  if (isRedisConnected()) {
    await withTimeout(redis.setex(cacheKey, 300, JSON.stringify(user)), 500);
  }

  req.user = user;
  next();
});

// Middleware for permission-based authorization
exports.requirePermission = (requiredPermission) => (req, res, next) => {
  const effectiveRole = mapRole(req.user.role);
  const permissions = ROLE_PERMISSIONS[effectiveRole] || [];

  if (permissions.includes('*') || permissions.includes(requiredPermission)) {
    logger.info(
      `[AUTH] Permission granted: user=${req.user._id} role=${req.user.role} permission=${requiredPermission}`
    );
    return next();
  }

  logger.warn(
    `[AUTH] Permission denied: user=${req.user._id} role=${req.user.role} required=${requiredPermission}`
  );
  next(new AppError('You lack the required permissions for this action.', 403));
};

// Middleware for role-based authorization
exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    const hasRole = roles.includes(req.user.role);
    const hasJobTitle = roles.some(
      (role) => req.user.jobTitle?.replace(' ', '_').toUpperCase() === role
    );

    if (!hasRole && !hasJobTitle) {
      logger.warn(
        `[AUTH] Role denied: user=${req.user._id} role=${req.user.role} jobTitle=${req.user.jobTitle} allowed=${roles.join(',')}`
      );
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    logger.info(
      `[AUTH] Role granted: user=${req.user._id} role=${req.user.role} endpoint=${req.originalUrl}`
    );
    next();
  };
