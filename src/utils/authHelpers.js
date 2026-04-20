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

// Check if user has manager or admin privileges
const isManagerOrAdmin = (user) => {
  const role = normalizeRole(user.role);
  return ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'].includes(role);
};

// Check if user is a strategic lead (Admin, Manager, or Lead job title)
const isStrategicLead = (user) => {
  const role = normalizeRole(user.role);
  const isLead = normalizeJobTitle(user.jobTitle).includes('LEAD');
  return ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'].includes(role) || isLead;
};

// Check if user has a lead job title restriction
const hasLeadRestriction = (user) => {
  return normalizeJobTitle(user.jobTitle).includes('LEAD');
};

// Map input role names to standard system roles
const mapRole = (roleName) => {
  return ROLE_MAPPING[normalizeRole(roleName)] || ROLE_MAPPING['PROJECT_MEMBER'];
};

module.exports = {
  ROLE_MAPPING,
  isManagerOrAdmin,
  isStrategicLead,
  hasLeadRestriction,
  mapRole,
};
