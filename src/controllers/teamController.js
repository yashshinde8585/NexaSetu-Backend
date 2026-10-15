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

  // Security Hardening: Ensure non-admins can only invite to projects they belong to
  const isAdmin =
    req.user.role === 'WORKSPACE_ADMIN' || req.user.role === 'ADMIN';
  if (!isAdmin && projectId) {
    const { canAccessResource } = require('../utils/authHelpers');
    const hasAccess = await canAccessResource(req.user, projectId, 'project');
    if (!hasAccess) {
      return ResponseBuilder.error(
        res,
        'Unauthorized project assignment. Managers can only invite to their own sectors.',
        'UNAUTHORIZED_PROJECT',
        403
      );
    }
  }

  const isLeadOrAdmin = isStrategicLead(req.user);
  if (!isLeadOrAdmin) {
    const allowedRoles = ['PROJECT_MEMBER', 'RESTRICTED'];
    if (!allowedRoles.includes(role)) {
      return ResponseBuilder.error(
        res,
        'Unauthorized role assignment.',
        'UNAUTHORIZED_ROLE',
        403
      );
    }
  }

  const result = await teamService.provisionUser(
    { email, role, projectId },
    req.user.workspaceId,
    req.user._id,
    'BIRTH'
  );

  if (result.status === 'EXISTING') {
    return ResponseBuilder.error(
      res,
      'User already has an account',
      'USER_EXISTS',
      400
    );
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
    return ResponseBuilder.error(
      res,
      'No invitations provided',
      'MISSING_INVITES',
      400
    );
  }

  const { provisionedUsers, failedInvites } = await teamService.bulkProvision(
    invites,
    req.user.workspaceId,
    req.user,
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
  const { page = 1, limit = 20, search = '', projectId } = req.query;
  const result = await teamService.getWorkspaceTeam(
    req.user,
    isStrategicLead(req.user),
    page,
    limit,
    search,
    projectId
  );

  return ResponseBuilder.success(res, {
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages,
    },
    data: {
      items: result.items,
      stats: result.stats,
    },
  });
});

exports.getWorkspaceRoles = catchAsync(async (req, res, next) => {
  const roleDefinitions = await adminService.getRoleDefinitions(
    req.user.workspaceId
  );
  return ResponseBuilder.success(res, { roles: roleDefinitions });
});

exports.removeInvitation = catchAsync(async (req, res, next) => {
  await teamService.removeInvitation(req.user, req.params.id);
  return ResponseBuilder.success(res, null, 204);
});

exports.updateMemberProject = catchAsync(async (req, res, next) => {
  const { projectId } = req.body;
  const { id: memberId } = req.params;

  // Security: Strategic leads can move anyone, others must have project access
  const isAdmin =
    req.user.role === 'WORKSPACE_ADMIN' || req.user.role === 'ADMIN';
  if (!isAdmin && projectId) {
    const { canAccessResource } = require('../utils/authHelpers');
    const hasAccess = await canAccessResource(req.user, projectId, 'project');
    if (!hasAccess) {
      return ResponseBuilder.error(
        res,
        'Unauthorized sector allocation.',
        'UNAUTHORIZED_ALLOCATION',
        403
      );
    }
  }

  const updatedMember = await teamService.updateMemberProject(
    req.user,
    memberId,
    projectId
  );

  await auditService.log({
    action: 'MEMBER_REASSIGN',
    req,
    entityType: 'USER',
    entityId: memberId,
    details: { newProjectId: projectId },
  });

  return ResponseBuilder.success(res, { member: updatedMember });
});
