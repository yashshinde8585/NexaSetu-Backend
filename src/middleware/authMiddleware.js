const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { mapRole } = require('../utils/authHelpers');

// Authenticates incoming requests via JWT and enforces role-based access control policies.
const protect = async (req, res, next) => {
  try {
    let token;

    // Extract JWT authentication material from headers or cross-origin cookies.
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res
        .status(401)
        .json({ status: 'fail', message: 'Not authorized, no token provided' });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check if user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'The user belonging to this token no longer exists',
      });
    }

    // 4. Check if password was changed after token was issued
    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        return res.status(401).json({
          status: 'fail',
          message: 'User recently changed password! Please log in again.',
        });
      }
    }

    // 5. Workspace Context Recovery (Self-Healing) - Optimized to avoid writes on every GET
    if (!user.workspaceId && req.method !== 'GET') {
      const workspace = await Workspace.findOne({
        $or: [{ admin: user._id }, { owner: user._id }],
      }).select('_id');
      
      if (workspace) {
        user.workspaceId = workspace._id;
        await User.updateOne({ _id: user._id }, { workspaceId: workspace._id });
      }
    }

    // 5. Grant access
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'fail', message: 'token_expired' });
    }
    res
      .status(401)
      .json({ status: 'fail', message: 'Not authorized, invalid token' });
  }
};

const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    // Standardize role nomenclature before validation checks.
    const effectiveRole = mapRole(req.user.role);

    const permissions = ROLE_PERMISSIONS[effectiveRole] || [];

    // Check if user has specific permission OR is super-admin ('*')
    if (permissions.includes('*') || permissions.includes(requiredPermission)) {
      return next();
    }

    return res.status(403).json({
      status: 'fail',
      message: 'You lack the required permissions for this action.',
    });
  };
};

/**
 * Restricts access to specific roles.
 * @param  {...string} roles - Allowed roles
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check role OR if jobTitle matches a mapped role
    const hasRole = roles.includes(req.user.role);
    const hasJobTitle = roles.some(role => 
      req.user.jobTitle && req.user.jobTitle.replace(' ', '_').toUpperCase() === role
    );

    if (!hasRole && !hasJobTitle) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action',
      });
    }
    next();
  };
};

module.exports = { protect, requirePermission, restrictTo };
