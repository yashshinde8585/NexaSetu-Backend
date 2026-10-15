const { normalizeRole, normalizeJobTitle } = require('./common');

const ROLE_MAPPING = {
  ADMIN: 'WORKSPACE_ADMIN',
  WORKSPACE_ADMIN: 'WORKSPACE_ADMIN',
  MANAGER: 'WORKSPACE_MANAGER',
  WORKSPACE_MANAGER: 'WORKSPACE_MANAGER',
  VP_ENGINEERING: 'WORKSPACE_MANAGER',
  ENGINEERING_MANAGER: 'WORKSPACE_MANAGER',
  TECH_LEAD: 'TECH_LEAD',
  SENIOR_ENGINEER: 'SENIOR_ENGINEER',
  SOFTWARE_ENGINEER: 'SOFTWARE_ENGINEER',
  DEV: 'SOFTWARE_ENGINEER',
  PROJECT_MEMBER: 'PROJECT_MEMBER',
  INTERN: 'INTERN',
  RESTRICTED: 'RESTRICTED',
};

const isManagerOrAdmin = (user) => {
  const effectiveRole = mapRole(user.role);
  return ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'].includes(effectiveRole);
};

const isStrategicLead = (user) => {
  const effectiveRole = mapRole(user.role);
  const isLead = normalizeJobTitle(user.jobTitle).includes('LEAD');
  return (
    ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'].includes(effectiveRole) || isLead
  );
};

const hasLeadRestriction = (user) => {
  return normalizeJobTitle(user.jobTitle).includes('LEAD');
};

const mapRole = (roleName) => {
  return (
    ROLE_MAPPING[normalizeRole(roleName)] || ROLE_MAPPING['PROJECT_MEMBER']
  );
};

const canAccessResource = async (user, resourceId, type) => {
  if (!user || !resourceId || !user.workspaceId) return false;

  if (user.role === 'WORKSPACE_ADMIN') return true;

  try {
    const mongoose = require('mongoose');
    const Model = mongoose.models[type === 'project' ? 'Project' : 'Task'];
    if (!Model) return false;

    const resource = await Model.findById(resourceId).select('workspaceId');
    if (!resource) return false;

    return resource.workspaceId.toString() === user.workspaceId.toString();
  } catch (err) {
    return false;
  }
};

module.exports = {
  ROLE_MAPPING,
  isManagerOrAdmin,
  isStrategicLead,
  hasLeadRestriction,
  mapRole,
  canAccessResource,
};
