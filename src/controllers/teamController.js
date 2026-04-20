const teamService = require('../services/teamService');
const auditService = require('../services/auditService');
const adminService = require('../services/adminService');
const catchAsync = require('../utils/catchAsync');
const { isStrategicLead } = require('../utils/authHelpers');

// Handles workspace personnel provisioning, team invitations, and role-based access management.

// Dispatches a role-specific invitation to a new user via token provisioning.
exports.inviteUser = catchAsync(async (req, res, next) => {
  const { email, role, projectId } = req.body;
  if (!email || !role)
    return res.status(400).json({ status: 'fail', message: 'Missing fields' });

  const isLeadOrAdmin = isStrategicLead(req.user);
  if (!isLeadOrAdmin) {
    const allowedRoles = ['PROJECT_MEMBER', 'RESTRICTED'];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        status: 'fail',
        message:
          'Unauthorized role assignment. Only Engineers and Interns can be recruited by non-admins.',
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
    return res
      .status(400)
      .json({ status: 'fail', message: 'User already has an account' });
  }

  await auditService.log({
    action: 'INVITE_USER',
    req,
    entityType: 'INVITATION',
    entityId: result.invitation._id,
    details: { email, role, projectId },
  });

  res.status(200).json({
    status: 'success',
    data: {
      invitation: {
        email: result.invitation.email,
        role: result.invitation.role,
        token: '********', // Redacted for security
      },
    },
  });
});

// Validates and extracts invitation details using an active provisioning token.
exports.getInviteByToken = catchAsync(async (req, res, next) => {
  const invitation = await teamService.getInviteByToken(req.params.token);

  res.status(200).json({
    status: 'success',
    data: {
      invitation: {
        email: invitation.email,
        role: invitation.role,
        projectId: invitation.projectId,
      },
    },
  });
});

// Provisions multiple users and roles simultaneously into the workspace.
exports.inviteMultipleUsers = catchAsync(async (req, res, next) => {
  const { invites } = req.body;
  if (!invites || !Array.isArray(invites) || invites.length === 0) {
    return res
      .status(400)
      .json({ status: 'fail', message: 'No invitations provided' });
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
    details: { count: provisionedUsers.length, failed: failedInvites.length },
  });

  res.status(200).json({
    status: 'success',
    data: {
      provisionedUsers,
      failedInvites,
      message: 'Squad provisioning complete.',
    },
  });
});

// Retrieves active workspace personnel and pending invitations with access control filtering.
exports.getWorkspaceTeam = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await teamService.getWorkspaceTeam(req.user, isStrategicLead(req.user), page, limit);

  res.status(200).json({
    status: 'success',
    pagination: {
      members: {
        total: result.totalMembers,
        page: result.page,
        limit: result.limit,
        pages: Math.ceil(result.totalMembers / result.limit),
      },
      invitations: {
        total: result.totalInvitations,
        page: result.page,
        limit: result.limit,
        pages: Math.ceil(result.totalInvitations / result.limit),
      },
    },
    data: { members: result.members, invitations: result.invitations },
  });
});

/**
 * Retrieves dynamic organizational role definitions for current workspace
 */
exports.getWorkspaceRoles = catchAsync(async (req, res, next) => {
  const roleDefinitions = await adminService.getRoleDefinitions(req.user.workspaceId);

  res.status(200).json({
    status: 'success',
    data: { roles: roleDefinitions }
  });
});
