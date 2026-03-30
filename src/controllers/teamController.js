const User = require('../models/User');
const Project = require('../models/Project');
const Invitation = require('../models/Invitation');
const teamService = require('../services/teamService');
const auditService = require('../services/auditService');
const catchAsync = require('../utils/catchAsync');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const { isStrategicLead } = require('../utils/authHelpers');



// 1. Single User Invitation
exports.inviteUser = catchAsync(async (req, res, next) => {
    const { email, role, projectId } = req.body;
    if (!email || !role) return res.status(400).json({ status: 'fail', message: 'Missing fields' });

    const isLeadOrAdmin = isStrategicLead(req.user);
    if (!isLeadOrAdmin) {
        const allowedRoles = ['PROJECT_MEMBER', 'RESTRICTED'];
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ 
                status: 'fail', 
                message: 'Unauthorized role assignment. Only Engineers and Interns can be recruited by non-admins.' 
            });
        }
    }

    // Provision via Token Strategy
    const result = await teamService.provisionUser(
        { email, role, projectId }, 
        req.user.workspaceId, 
        req.user._id, 
        'INVITE'
    );

    if (result.status === 'EXISTING') {
        return res.status(400).json({ status: 'fail', message: 'User already has an account' });
    }

    await auditService.log({
        action: 'INVITE_USER',
        req,
        entityType: 'INVITATION',
        entityId: result.invitation._id,
        details: { email, role, projectId }
    });

    res.status(200).json({
      status: 'success',
      data: {
        invitation: {
          email: result.invitation.email,
          role: result.invitation.role,
          token: '********' // Redacted for security
        }
      }
    });
});

// 2. Resolve Invitation by Token
exports.getInviteByToken = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const invitation = await Invitation.findOne({ token, status: 'pending', expiresAt: { $gt: Date.now() } });
    
    if (!invitation) return res.status(404).json({ status: 'fail', message: 'Invalid or expired invitation' });

    res.status(200).json({
      status: 'success',
      data: {
        invitation: {
          email: invitation.email,
          role: invitation.role,
          projectId: invitation.projectId
        }
      }
    });
});

// 3. Bulk Personnel Provisioning (Instant Birth)
exports.inviteMultipleUsers = catchAsync(async (req, res, next) => {
    const { invites } = req.body;
    if (!invites || !Array.isArray(invites) || invites.length === 0) {
        return res.status(400).json({ status: 'fail', message: 'No invitations provided' });
    }

    const { provisionedUsers, failedInvites } = await teamService.bulkProvision(
        invites, 
        req.user.workspaceId, 
        req.user._id, 
        isStrategicLead(req.user)
    );

    // 📝 Audit logging
    await auditService.log({
        action: 'BULK_PROVISION',
        req,
        entityType: 'USER',
        details: { count: provisionedUsers.length, failed: failedInvites.length }
    });

    res.status(200).json({ 
      status: 'success', 
      data: { 
        provisionedUsers, 
        failedInvites,
        message: 'Squad provisioning complete.' 
      } 
    });
});

// 4. Get Workspace Personnel Hub
exports.getWorkspaceTeam = catchAsync(async (req, res, next) => {
    const workspaceId = req.user.workspaceId;
    
    let memberQuery = { workspaceId };
    let invitationQuery = { workspaceId, status: 'pending', expiresAt: { $gt: Date.now() } };

    if (!isStrategicLead(req.user)) {
        // Restricted Visibility: Only see personnel in projects you are a member of
        const authorizedProjects = await Project.find(getProjectAccessQuery(req.user)).select('_id');
        const authorizedProjectIds = authorizedProjects.map(p => p._id);

        memberQuery.assignedProjectId = { $in: authorizedProjectIds };
        invitationQuery.projectId = { $in: authorizedProjectIds };
    }

    const members = await User.find(memberQuery)
      .select('name email role jobTitle createdAt assignedProjectId')
      .populate('assignedProjectId', 'name');

    const invitations = await Invitation.find(invitationQuery)
      .select('email role expiresAt projectId')
      .populate('projectId', 'name');

    res.status(200).json({ status: 'success', data: { members, invitations } });
});
