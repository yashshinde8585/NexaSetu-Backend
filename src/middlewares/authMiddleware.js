const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const config = require('../config/config');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { mapRole } = require('../utils/authHelpers');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const crypto = require('crypto');
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
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const cacheKey = `session:user:${tokenHash}`;

  if (isRedisConnected()) {
    const cachedUser = await withTimeout(redis.get(cacheKey), 500);
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
      if (req.user.status === 'Deactivated') {
        return next(
          new AppError(
            'Your account has been deactivated. Please contact your workspace administrator.',
            403
          )
        );
      }
      return next();
    }
  }
  if (useClerk) {
    try {
      let decodedToken;
      let isLocalToken = false;
      try {
        const decoded = jwt.decode(token, { complete: true });
        if (
          decoded &&
          decoded.header?.alg === 'HS256' &&
          !decoded.header?.kid
        ) {
          isLocalToken = true;
        }
      } catch (e) {}

      if (isLocalToken) {
        try {
          const decoded = jwt.verify(token, config.jwt.secret);
          user = await User.findById(decoded.id).select('-password');
          if (user) {
            if (user.passwordChangedAt) {
              const changedTimestamp = parseInt(
                user.passwordChangedAt.getTime() / 1000,
                10
              );
              if (decoded.iat && decoded.iat < changedTimestamp) {
                return next(
                  new AppError(
                    'User recently changed password! Please log in again.',
                    401
                  )
                );
              }
            }
            decodedToken = { sub: user.clerkUserId || user._id.toString() };
          } else {
            return next(
              new AppError(
                'The user belonging to this token no longer exists.',
                401
              )
            );
          }
        } catch (localJwtErr) {
          logger.warn(
            `[AUTH] Local token verification failed: ${localJwtErr.message}. Trying Clerk...`
          );
        }
      }

      if (!user) {
        if (process.env.CLERK_JWT_KEY) {
          try {
            const pemKey = process.env.CLERK_JWT_KEY.replace(/\\n/g, '\n');
            decodedToken = jwt.verify(token, pemKey, { algorithms: ['RS256'] });
          } catch (localErr) {
            logger.warn(
              `[AUTH-LOCAL] Local Clerk JWT verification failed: ${localErr.message}. Falling back to API...`
            );
            decodedToken = await clerkClient.verifyToken(token);
          }
        } else {
          decodedToken = await clerkClient.verifyToken(token);
        }
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
            logger.info(
              `[AUTH-JIT] Auto-provisioning new Clerk user ${email} (${userId})`
            );
            const name =
              `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() ||
              email.split('@')[0];
            const authService = require('../services/authService');

            const newUserData = {
              name,
              email,
              password: crypto.randomBytes(32).toString('hex'),
              clerkUserId: userId,
              role: 'WORKSPACE_ADMIN',
              workspaceName: `${name}'s Hub`,
              admin: name,
              plan: 'enterprise',
            };

            const createdUser = await authService.registerUser(newUserData);
            user = await User.findById(createdUser._id).select('-password');
          }
        }
      }
    } catch (err) {
      let kid = 'unknown';
      let alg = 'unknown';
      let iss = 'unknown';
      let sub = 'unknown';
      let exp = null;

      try {
        const decoded = jwt.decode(token, { complete: true });
        if (decoded) {
          kid = decoded.header?.kid || 'N/A';
          alg = decoded.header?.alg || 'N/A';
          iss = decoded.payload?.iss || 'N/A';
          sub = decoded.payload?.sub || 'N/A';
          exp = decoded.payload?.exp
            ? new Date(decoded.payload.exp * 1000).toISOString()
            : 'N/A';
        }
      } catch (_decodingErr) {
        // ignore decoding errors
      }

      const tokenPrefix =
        token && token.length > 10 ? token.substring(0, 10) : '';
      const tokenSuffix =
        token && token.length > 10 ? token.substring(token.length - 6) : '';

      logger.error(
        `[CLERK-AUTH-FAILURE] Clerk JWT validation failed. Error: ${err.message}. ` +
          `Token signature info (Prefix: ${tokenPrefix}..., Suffix: ...${tokenSuffix}, Length: ${token ? token.length : 0}). ` +
          `Decoded JWT Info (KID: ${kid}, ALG: ${alg}, ISS: ${iss}, SUB: ${sub}, EXP: ${exp})`
      );
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

  if (user.status === 'Deactivated') {
    return next(
      new AppError(
        'Your account has been deactivated. Please contact your workspace administrator.',
        403
      )
    );
  }

  // Recover missing workspace context automatically
  if (!user.workspaceId) {
    let workspace = await Workspace.findOne({
      $or: [{ admin: user._id }, { owner: user._id }],
    }).select('_id');

    if (!workspace) {
      const workspaceService = require('../services/workspaceService');
      workspace = await workspaceService.provisionWorkspace({
        name: `${user.name || 'User'}'s Hub`,
        adminName: user.name,
        plan: 'free',
      });
      await workspaceService.transferOwnership(workspace._id, user._id);
    }

    user.workspaceId = workspace._id;
    await User.updateOne({ _id: user._id }, { workspaceId: workspace._id });
  }

  // 3. Store in cache for subsequent requests (5 minute TTL)
  if (isRedisConnected()) {
    await withTimeout(redis.setex(cacheKey, 300, JSON.stringify(user)), 500);
  }

  req.user = user;
  const { getContext } = require('../utils/context');
  const store = getContext();
  if (store) {
    store.user = { id: user._id, role: user.role };
  }
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
      (role) => req.user.jobTitle?.replace(/\s+/g, '_').toUpperCase() === role
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

// Middleware that extracts user if authenticated, but does not enforce authentication
exports.optionalProtect = catchAsync(async (req, res, next) => {
  const useClerk = process.env.USE_CLERK_AUTH === 'true';
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (useClerk && req.cookies?.__session) {
    token = req.cookies.__session;
  } else if (!useClerk && req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next();
  }

  try {
    const redis = getRedisClient();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const cacheKey = `session:user:${tokenHash}`;

    if (isRedisConnected()) {
      const cachedUser = await withTimeout(redis.get(cacheKey), 500);
      if (cachedUser) {
        req.user = JSON.parse(cachedUser);
        return next();
      }
    }

    let user;
    if (useClerk) {
      let decodedToken;
      let isLocalToken = false;
      try {
        const decoded = jwt.decode(token, { complete: true });
        if (
          decoded &&
          decoded.header?.alg === 'HS256' &&
          !decoded.header?.kid
        ) {
          isLocalToken = true;
        }
      } catch (e) {}

      if (isLocalToken) {
        try {
          const decoded = jwt.verify(token, config.jwt.secret);
          user = await User.findById(decoded.id).select('-password');
        } catch (localJwtErr) {}
      }

      if (!user) {
        if (process.env.CLERK_JWT_KEY) {
          try {
            const pemKey = process.env.CLERK_JWT_KEY.replace(/\\n/g, '\n');
            decodedToken = jwt.verify(token, pemKey, { algorithms: ['RS256'] });
          } catch (localErr) {
            decodedToken = await clerkClient.verifyToken(token);
          }
        } else {
          decodedToken = await clerkClient.verifyToken(token);
        }
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
            const name =
              `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() ||
              email.split('@')[0];
            const authService = require('../services/authService');

            const newUserData = {
              name,
              email,
              password: crypto.randomBytes(32).toString('hex'),
              clerkUserId: userId,
              role: 'WORKSPACE_ADMIN',
              workspaceName: `${name}'s Hub`,
              admin: name,
              plan: 'enterprise',
            };

            const createdUser = await authService.registerUser(newUserData);
            user = await User.findById(createdUser._id).select('-password');
          }
        }
      }
    } else {
      let decoded;
      try {
        decoded = jwt.verify(token, config.jwt.secret);
        user = await User.findById(decoded.id).select('-password');
      } catch (err) {}
    }

    if (user) {
      if (isRedisConnected()) {
        await withTimeout(
          redis.setex(cacheKey, 300, JSON.stringify(user)),
          500
        );
      }
      req.user = user;
      const { getContext } = require('../utils/context');
      const store = getContext();
      if (store) {
        store.user = { id: user._id, role: user.role };
      }
    }
  } catch (err) {
    logger.warn(
      `[AUTH-OPTIONAL] Failed to parse optional credentials: ${err.message}`
    );
  }

  next();
});
