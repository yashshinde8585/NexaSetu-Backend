const { hasLeadRestriction } = require('./authHelpers');

const getProjectAccessQuery = (user) => {
    const query = { workspaceId: user.workspaceId };
    const administrativeRoles = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'];
    
    // Normalize role to handle accidental database formatting issues
    const normalizedRole = (user.role || '').trim().toUpperCase();
    
    if (!administrativeRoles.includes(normalizedRole) || (normalizedRole === 'WORKSPACE_MANAGER' && hasLeadRestriction(user))) {
        if (user.assignedProjectId) {
            return { ...query, $or: [
                { _id: user.assignedProjectId }, 
                { members: user._id }
            ] };
        }
        
        return { ...query, $or: [
            { members: user._id }, 
            { createdBy: user._id }
        ] };
    }

    return query;
};

const getTaskAccessQuery = (user, projectListIds = []) => {
    const query = { workspaceId: user.workspaceId };
    const normalizedRole = (user.role || '').trim().toUpperCase();

    const administrativeRoles = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'];
    
    if (!administrativeRoles.includes(normalizedRole) || (normalizedRole === 'WORKSPACE_MANAGER' && hasLeadRestriction(user))) {
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
