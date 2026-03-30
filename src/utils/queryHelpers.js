const { hasLeadRestriction } = require('./authHelpers');

const getProjectAccessQuery = (user) => {
    const query = { workspaceId: user.workspaceId };
    const administrativeRoles = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'];
    
    if (!administrativeRoles.includes(user.role) || (user.role === 'WORKSPACE_MANAGER' && hasLeadRestriction(user))) {
        if (user.assignedProjectId) {
            return { ...query, _id: user.assignedProjectId };
        }
        
        return { ...query, members: user._id };
    }

    return query;
};

const getTaskAccessQuery = (user, projectListIds = []) => {
    const query = { workspaceId: user.workspaceId };

    const administrativeRoles = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'];
    
    if (!administrativeRoles.includes(user.role) || (user.role === 'WORKSPACE_MANAGER' && hasLeadRestriction(user))) {
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
