const teamService = require('../services/teamService');
const auditService = require('../services/auditService');
const adminService = require('../services/adminService');
const catchAsync = require('../utils/catchAsync');
const ResponseBuilder = require('../utils/responseBuilder');
const { isStrategicLead } = require('../utils/authHelpers');

exports.inviteUser = catchAsync(async (req, res, next) => {
  const { email, role, projectId } = req.body;
  if (!email || !role)
    return ResponseBuilder.error(res, 'Missing fields', 'MISSING_FIELDS', 400);

  const isLeadOrAdmin = isStrategicLead(req.user);
  if (!isLeadOrAdmin) {
    const allowedRoles = ['PROJECT_MEMBER', 'RESTRICTED'];
    if (!allowedRoles.includes(role)) {
      return ResponseBuilder.error(res, 'Unauthorized role assignment.', 'UNAUTHORIZED_ROLE', 403);
    }
  }

  const result = await teamService.provisionUser(
    { email, role, projectId },
    req.user.workspaceId,
    req.user._id,
    'BIRTH'
  );

  if (result.status === 'EXISTING') {
    return ResponseBuilder.error(res, 'User already has an account', 'USER_EXISTS', 400);
  }

  await auditService.log({
    action: 'INVITE_USER',
    req,
    entityType: 'INVITATION',
    entityId: result.invitation._id,
    details: { email, role, projectId },
  });

  return ResponseBuilder.success(res, {
    invitation: {
      email: result.invitation.email,
      role: result.invitation.role,
      token: '********',
    },
  });
});

exports.getInviteByToken = catchAsync(async (req, res, next) => {
  const invitation = await teamService.getInviteByToken(req.params.token);

  return ResponseBuilder.success(res, {
    invitation: {
      email: invitation.email,
      role: invitation.role,
      projectId: invitation.projectId,
    },
  });
});

exports.inviteMultipleUsers = catchAsync(async (req, res, next) => {
  const { invites } = req.body;
  if (!invites || !Array.isArray(invites) || invites.length === 0) {
    return ResponseBuilder.error(res, 'No invitations provided', 'MISSING_INVITES', 400);
  }

  const { provisionedUsers, failedInvites } = await teamService.bulkProvision(
    invites,
    req.user.workspaceId,
    req.user._id,
    isStrategicLead(req.user)
  );

  await auditService.log({
    action: 'BULK_PROVISION',
    req,
    entityType: 'USER',
    details: { count: provisionedUsers.length, failed: failedInvites.length },
  });

  return ResponseBuilder.success(res, {
    provisionedUsers,
    failedInvites,
    message: 'Squad provisioning complete.',
  });
});

exports.getWorkspaceTeam = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await teamService.getWorkspaceTeam(req.user, isStrategicLead(req.user), page, limit);

  return ResponseBuilder.success(res, {
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

exports.getWorkspaceRoles = catchAsync(async (req, res, next) => {
  const roleDefinitions = await adminService.getRoleDefinitions(req.user.workspaceId);
  return ResponseBuilder.success(res, { roles: roleDefinitions });
});

exports.removeInvitation = catchAsync(async (req, res, next) => {
  await teamService.removeInvitation(req.user, req.params.id);
  return ResponseBuilder.success(res, null, 204);
});
