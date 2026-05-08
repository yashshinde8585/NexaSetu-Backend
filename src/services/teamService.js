const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Project = require('../models/Project');
const crypto = require('crypto');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const AppError = require('../utils/appError');
const metricsService = require('./metricsService');
const logger = require('../utils/logger');
const { createClerkClient } = require('@clerk/clerk-sdk-node');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const provisionUser = async (
  { name, email, role, projectId, jobTitle },
  workspaceId,
  invitedBy,
  strategy = 'BIRTH'
) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return { status: 'EXISTING', user: existingUser };
  }

  if (strategy === 'BIRTH') {
    let clerkUserId = null;

    // Clerk Hardening: Create user in Clerk so they can actually log in
    try {
      const clerkUser = await clerkClient.users.createUser({
        emailAddress: [email],
        password: email, // As per UI invitation: "Temporary Password: {email}"
        firstName: name?.split(' ')[0] || '',
        lastName: name?.split(' ').slice(1).join(' ') || '',
        skipPasswordChecks: true,
        skipEmailVerification: true,
      });
      clerkUserId = clerkUser.id;
      logger.info(`[CLERK] Provisioned user ${email} for login.`);
    } catch (err) {
      // If user already exists in Clerk, we just need their ID
      if (err.errors?.[0]?.code === 'form_identifier_exists' || err.status === 422) {
        const existingClerkUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
        if (existingClerkUsers.length > 0) {
          clerkUserId = existingClerkUsers[0].id;
          logger.info(`[CLERK] User ${email} already exists in Clerk. Linked to ID: ${clerkUserId}`);
        }
      } else {
        logger.error(`[CLERK] Failed to create user during provisioning: ${err.message}`);
        // We continue anyway, the webhook might catch it or they might sign up manually later
      }
    }

    const newUser = await User.create({
      name: name || email.split('@')[0],
      email,
      password: 'CLERK_MANAGED',
      clerkUserId,
      role: role || 'PROJECT_MEMBER',
      jobTitle: jobTitle || 'Software Engineer',
      assignedProjectId: projectId || null,
      workspaceId,
    });

    if (projectId) {
      await Project.findByIdAndUpdate(projectId, {
        $addToSet: { members: newUser._id },
      });
    }

    return { status: 'PROVISIONED', user: newUser };
  } else {
    const token = crypto.randomBytes(32).toString('hex');
    const invitation = await Invitation.findOneAndUpdate(
      { email },
      {
        role,
        projectId,
        workspaceId,
        token,
        invitedBy,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, returnDocument: 'after' }
    );

    metricsService.trackEvent({ _id: invitedBy, workspaceId }, 'invite_sent', { 
      inviteeEmail: email,
      role: role,
      projectId: projectId 
    }).catch(err => logger.error(`[METRICS] Failed to track invitation: ${err.message}`));

    return { status: 'INVITED', invitation };
  }
};

const bulkProvision = async (invites, workspaceId, user, isStrategicLead) => {
  const provisionedUsers = [];
  const failedInvites = [];
  const engineeringRecruiterRoles = ['PROJECT_MEMBER', 'RESTRICTED'];
  const isAdmin = user.role === 'WORKSPACE_ADMIN' || user.role === 'ADMIN';

  // Controlled concurrency helper
  const CONCURRENCY_LIMIT = 3;
  
  const processInvite = async (invite) => {
    try {
      if (
        !isStrategicLead &&
        !engineeringRecruiterRoles.includes(invite.role)
      ) {
        throw new Error(
          `Unauthorized role (${invite.role}). Only Engineers and Interns can be recruited by non-admins.`
        );
      }

      // Security Hardening: Project access check for non-admins
      if (!isAdmin && invite.projectId) {
        const { canAccessResource } = require('../utils/authHelpers');
        const hasAccess = await canAccessResource(user, invite.projectId, 'project');
        if (!hasAccess) {
          throw new Error('Unauthorized project assignment for this sector.');
        }
      }

      const result = await provisionUser(
        invite,
        workspaceId,
        user._id,
        'BIRTH'
      );

      if (result.status === 'EXISTING') {
        throw new Error('User already has an account');
      }

      return {
        success: true,
        data: {
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          status: 'PROVISIONED',
        }
      };
    } catch (err) {
      return { success: false, email: invite.email, message: err.message };
    }
  };

  // Process in batches to maintain controlled concurrency
  for (let i = 0; i < invites.length; i += CONCURRENCY_LIMIT) {
    const batch = invites.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(batch.map(invite => processInvite(invite)));
    
    for (const res of batchResults) {
      if (res.success) {
        provisionedUsers.push(res.data);
      } else {
        failedInvites.push({ email: res.email, message: res.message });
      }
    }
  }

  return { provisionedUsers, failedInvites };
};


const getInviteByToken = async (token) => {
  const invitation = await Invitation.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: Date.now() },
  });

  if (!invitation) {
    throw new AppError('Invalid or expired invitation', 404);
  }

  return invitation;
};

const getWorkspaceTeam = async (user, isStrategicLead, page = 1, limit = 20) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const limitValue = parseInt(limit);
  const workspaceId = user.workspaceId;

  let memberQuery = { workspaceId };
  let invitationQuery = {
    workspaceId,
    status: 'pending',
    expiresAt: { $gt: Date.now() },
  };

  if (!isStrategicLead) {
    const authorizedProjects = await Project.find(
      getProjectAccessQuery(user)
    ).select('_id');
    const authorizedProjectIds = authorizedProjects.map((p) => p._id);

    memberQuery.assignedProjectId = { $in: authorizedProjectIds };
    invitationQuery.projectId = { $in: authorizedProjectIds };
  }

  const [members, totalMembers, invitations, totalInvitations] = await Promise.all([
    User.find(memberQuery)
      .select('name email role jobTitle createdAt assignedProjectId profilePicture')
      .populate('assignedProjectId', 'name')
      .skip(skip)
      .limit(limitValue)
      .sort('name')
      .lean(),
    User.countDocuments(memberQuery),
    Invitation.find(invitationQuery)
      .select('email role expiresAt projectId')
      .populate('projectId', 'name')
      .skip(skip)
      .limit(limitValue)
      .lean(),
    Invitation.countDocuments(invitationQuery),
  ]);

  return {
    members,
    totalMembers,
    invitations,
    totalInvitations,
    page: parseInt(page),
    limit: limitValue
  };
};

const removeInvitation = async (user, invitationId) => {
  const invitation = await Invitation.findById(invitationId);
  if (!invitation) throw new AppError('Invitation not found', 404);

  if (invitation.workspaceId.toString() !== user.workspaceId.toString()) {
    throw new AppError('Access Denied: Invitation does not belong to your workspace', 403);
  }

  await Invitation.findByIdAndDelete(invitationId);
  return true;
};

const updateMemberProject = async (user, memberId, projectId) => {
  const member = await User.findOne({ _id: memberId, workspaceId: user.workspaceId });
  if (!member) throw new AppError('Member not found', 404);

  const oldProjectId = member.assignedProjectId;

  // 1. Update the User
  member.assignedProjectId = projectId || null;
  await member.save();

  // 2. Remove from old project if exists
  if (oldProjectId) {
    await Project.findByIdAndUpdate(oldProjectId, {
      $pull: { members: memberId }
    });
  }

  // 3. Add to new project if exists
  if (projectId) {
    await Project.findByIdAndUpdate(projectId, {
      $addToSet: { members: memberId }
    });
  }

  return member;
};

module.exports = {
  provisionUser,
  bulkProvision,
  getInviteByToken,
  getWorkspaceTeam,
  removeInvitation,
  updateMemberProject,
};
