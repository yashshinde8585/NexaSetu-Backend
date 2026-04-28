const RoleResolver = require('./roleResolver');
const ScopeResolver = require('./scopeResolver');

const checkPermission = (requiredAction) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id; // Assuming authMiddleware runs first
      const hasPerm = await RoleResolver.hasPermission(userId, requiredAction);
      
      if (!hasPerm) {
        return res.status(403).json({ message: `Forbidden: Requires permission ${requiredAction}` });
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
      const roles = await RoleResolver.getUserRoles(req.user._id);
      if (!roles.some(r => r.name === requiredRole)) {
        return res.status(403).json({ message: `Forbidden: Requires role ${requiredRole}` });
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
      // Very basic resource extraction based on path
      const pathParts = resourcePath.split('.');
      let resourceTeamId = req;
      for (const part of pathParts) {
        resourceTeamId = resourceTeamId[part];
        if (!resourceTeamId) break;
      }

      if (resourceTeamId) {
        const canAccess = await ScopeResolver.canAccessResource(req.user._id, resourceTeamId);
        if (!canAccess) {
          return res.status(403).json({ message: 'Forbidden: Scope violation (cannot access resource from another team)' });
        }
      }
      
      // Also inject user's scope into req for downstream filtering
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
  enforceScope
};
