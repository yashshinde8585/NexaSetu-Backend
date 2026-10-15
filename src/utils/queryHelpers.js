const { hasLeadRestriction } = require('./authHelpers');
const { normalizeRole } = require('./common');

const ADMIN_ROLES = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'TECH_LEAD'];

// Check if user has administrative permissions
const hasAdminAccess = (user) => {
  const role = normalizeRole(user.role);
  if (!ADMIN_ROLES.includes(role)) return false;
  if (role === 'WORKSPACE_MANAGER' && hasLeadRestriction(user)) return false;
  return true;
};

// Generate filters for role-based project access
const getProjectAccessQuery = (user) => {
  const query = { workspaceId: user.workspaceId };

  if (!hasAdminAccess(user)) {
    if (user.assignedProjectId) {
      return {
        ...query,
        $or: [{ _id: user.assignedProjectId }, { members: user._id }],
      };
    }
    return { ...query, $or: [{ members: user._id }, { createdBy: user._id }] };
  }

  return query;
};

// Generate filters for role-based task access
const getTaskAccessQuery = (user, projectListIds = []) => {
  const query = { workspaceId: user.workspaceId };

  if (!hasAdminAccess(user)) {
    if (projectListIds.length > 0) {
      query.project = { $in: projectListIds };
    } else if (user.assignedProjectId) {
      query.project = user.assignedProjectId;
    } else {
      query.project = null;
    }
  }

  return query;
};

module.exports = { getProjectAccessQuery, getTaskAccessQuery };
