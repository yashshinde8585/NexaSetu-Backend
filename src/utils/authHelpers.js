const ROLE_MAPPING = {
    'ADMIN': 'WORKSPACE_ADMIN',
    'WORKSPACE_ADMIN': 'WORKSPACE_ADMIN',
    'MANAGER': 'WORKSPACE_MANAGER',
    'WORKSPACE_MANAGER': 'WORKSPACE_MANAGER',
    'SOFTWARE_ENGINEER': 'PROJECT_MEMBER',
    'DEV': 'PROJECT_MEMBER',
    'PROJECT_MEMBER': 'PROJECT_MEMBER',
    'INTERN': 'INTERN',
    'RESTRICTED': 'RESTRICTED'
};

const isManagerOrAdmin = (user) => {
    const role = (user.role || '').trim().toUpperCase();
    return ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'].includes(role);
};

const isStrategicLead = (user) => {
    const role = (user.role || '').trim().toUpperCase();
    const isLead = (user.jobTitle || '').toUpperCase().includes('LEAD');
    return ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'].includes(role) || isLead;
};

const hasLeadRestriction = (user) => {
    return (user.jobTitle || '').toUpperCase().includes('LEAD');
};

const mapRole = (roleName) => {
    return ROLE_MAPPING[(roleName || '').toUpperCase()] || ROLE_MAPPING['PROJECT_MEMBER'];
};

module.exports = {
    ROLE_MAPPING,
    isManagerOrAdmin,
    isStrategicLead,
    hasLeadRestriction,
    mapRole
};
