const RoleResolver = require('./roleResolver');
const ScopeResolver = require('./scopeResolver');

const checkPermission = (requiredAction) => {
  return async (req, res, next) => {
    try {
      if (!req.user)
        return res
          .status(401)
          .json({ message: 'Unauthorized: Missing user context' });
      const userId = req.user._id;
      const hasPerm = await RoleResolver.hasPermission(userId, requiredAction);

      if (!hasPerm) {
        return res.status(403).json({
          message: `Forbidden: Requires permission ${requiredAction}`,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

const checkRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user)
        return res
          .status(401)
          .json({ message: 'Unauthorized: Missing user context' });
      const roles = await RoleResolver.getUserRoles(req.user._id);
      if (!roles.some((r) => r.name === requiredRole)) {
        return res
          .status(403)
          .json({ message: `Forbidden: Requires role ${requiredRole}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

const enforceScope = (resourcePath = 'body.teamId') => {
  return async (req, res, next) => {
    try {
      if (!req.user)
        return res
          .status(401)
          .json({ message: 'Unauthorized: Missing user context' });

      // Fast-pass for Workspace Admins
      const roles = await RoleResolver.getUserRoles(req.user._id);
      const isWorkspaceAdmin = roles.some((r) => r.name === 'WORKSPACE_ADMIN');

      if (isWorkspaceAdmin) {
        // Admins have global access, but we still inject scopedTeams for consistency
        req.scopedTeams = await ScopeResolver.getScopedTeams(req.user._id);
        return next();
      }

      // Resource extraction
      const pathParts = resourcePath.split('.');
      let resourceTeamId = req;
      for (const part of pathParts) {
        resourceTeamId = resourceTeamId?.[part];
        if (!resourceTeamId) break;
      }

      // CRITICAL: Fail if identifier is missing for non-admins to prevent bypass
      if (!resourceTeamId) {
        return res.status(400).json({
          message: `Bad Request: Missing resource identifier at ${resourcePath}`,
        });
      }

      const canAccess = await ScopeResolver.canAccessResource(
        req.user._id,
        resourceTeamId
      );
      if (!canAccess) {
        return res.status(403).json({
          message:
            'Forbidden: Scope violation (cannot access resource from another team)',
        });
      }

      req.scopedTeams = await ScopeResolver.getScopedTeams(req.user._id);
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = {
  checkPermission,
  checkRole,
  enforceScope,
};
