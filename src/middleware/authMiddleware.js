const jwt = require('jsonwebtoken');
const User = require('../models/User');
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
      return res
        .status(401)
        .json({
          status: 'fail',
          message: 'The user belonging to this token no longer exists',
        });
    }

    // 4. Workspace Context Recovery (Self-Healing)
    if (!user.workspaceId) {
      const Workspace = require('../models/Workspace');
      const workspace = await Workspace.findOne({
        $or: [{ admin: user._id }, { owner: user._id }],
      });
      if (workspace) {
        user.workspaceId = workspace._id;
        // Optionally save it back to the user for future use
        user.save({ validateBeforeSave: false });
      }
    }

    // 5. Grant access
    req.user = user;
    next();
  } catch (error) {
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

module.exports = { protect, requirePermission };
