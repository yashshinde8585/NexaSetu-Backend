const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const AppError = require('../utils/appError');
const metricsService = require('./metricsService');
const logger = require('../utils/logger');
const { createClerkClient } = require('@clerk/clerk-sdk-node');

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

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
      if (
        err.errors?.[0]?.code === 'form_identifier_exists' ||
        err.status === 422
      ) {
        const existingClerkUsers = await clerkClient.users.getUserList({
          emailAddress: [email],
        });
        if (existingClerkUsers.length > 0) {
          clerkUserId = existingClerkUsers[0].id;
          logger.info(
            `[CLERK] User ${email} already exists in Clerk. Linked to ID: ${clerkUserId}`
          );
        }
      } else {
        logger.error(
          `[CLERK] Failed to create user during provisioning: ${err.message}`
        );
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

    metricsService
      .trackEvent({ _id: invitedBy, workspaceId }, 'invite_sent', {
        inviteeEmail: email,
        role: role,
        projectId: projectId,
      })
      .catch((err) =>
        logger.error(`[METRICS] Failed to track invitation: ${err.message}`)
      );

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
        const hasAccess = await canAccessResource(
          user,
          invite.projectId,
          'project'
        );
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
        },
      };
    } catch (err) {
      return { success: false, email: invite.email, message: err.message };
    }
  };

  // Process in batches to maintain controlled concurrency
  for (let i = 0; i < invites.length; i += CONCURRENCY_LIMIT) {
    const batch = invites.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(
      batch.map((invite) => processInvite(invite))
    );

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

const getWorkspaceTeamStats = async (workspaceId) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  // 1. Total Users
  const totalCount = await User.countDocuments({ workspaceId });
  const countBefore30Days = await User.countDocuments({
    workspaceId,
    createdAt: { $lt: thirtyDaysAgo },
  });
  const totalGrowth =
    countBefore30Days > 0
      ? parseFloat(
          (
            ((totalCount - countBefore30Days) / countBefore30Days) *
            100
          ).toFixed(1)
        )
      : 0;

  const totalTrend = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(Date.now() - i * 6 * 24 * 60 * 60 * 1000);
    const count = await User.countDocuments({
      workspaceId,
      createdAt: { $lte: date },
    });
    totalTrend.push({ val: count });
  }

  // 2. Active Users (30d)
  const activePerformerIds = await AuditLog.distinct('performer', {
    workspaceId,
    timestamp: { $gte: thirtyDaysAgo },
  });
  const activePerformersSet = new Set(
    activePerformerIds.map((id) => id.toString())
  );
  const recentUsers = await User.find({
    workspaceId,
    createdAt: { $gte: thirtyDaysAgo },
  }).select('_id');
  recentUsers.forEach((u) => activePerformersSet.add(u._id.toString()));
  const activeCount = activePerformersSet.size;

  const prevActivePerformerIds = await AuditLog.distinct('performer', {
    workspaceId,
    timestamp: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
  });
  const prevActivePerformersSet = new Set(
    prevActivePerformerIds.map((id) => id.toString())
  );
  const prevRecentUsers = await User.find({
    workspaceId,
    createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
  }).select('_id');
  prevRecentUsers.forEach((u) => prevActivePerformersSet.add(u._id.toString()));
  const prevActiveCount = prevActivePerformersSet.size;
  const activeGrowth =
    prevActiveCount > 0
      ? parseFloat(
          (((activeCount - prevActiveCount) / prevActiveCount) * 100).toFixed(1)
        )
      : 0;

  const activeTrend = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 5 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - i * 5 * 24 * 60 * 60 * 1000);
    const performers = await AuditLog.distinct('performer', {
      workspaceId,
      timestamp: { $gte: start, $lte: end },
    });
    const performersSet = new Set(performers.map((id) => id.toString()));
    const usersCreated = await User.find({
      workspaceId,
      createdAt: { $gte: start, $lte: end },
    }).select('_id');
    usersCreated.forEach((u) => performersSet.add(u._id.toString()));
    activeTrend.push({ val: performersSet.size });
  }

  // 3. New Users (30d)
  const newCount = await User.countDocuments({
    workspaceId,
    createdAt: { $gte: thirtyDaysAgo },
  });
  const prevNewCount = await User.countDocuments({
    workspaceId,
    createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
  });
  const newGrowth =
    prevNewCount > 0
      ? parseFloat(
          (((newCount - prevNewCount) / prevNewCount) * 100).toFixed(1)
        )
      : 0;

  const newTrend = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 5 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - i * 5 * 24 * 60 * 60 * 1000);
    const count = await User.countDocuments({
      workspaceId,
      createdAt: { $gte: start, $lte: end },
    });
    newTrend.push({ val: count });
  }

  // 4. Inactive Users (> 90d)
  const activeUsers90d = await AuditLog.distinct('performer', {
    workspaceId,
    timestamp: { $gte: ninetyDaysAgo },
  });
  const activeUsers90dSet = new Set(activeUsers90d.map((id) => id.toString()));
  const allUsersList = await User.find({ workspaceId }).select('_id');
  const inactiveCount = allUsersList.filter(
    (u) => !activeUsers90dSet.has(u._id.toString())
  ).length;

  const activeUsersPrev90d = await AuditLog.distinct('performer', {
    workspaceId,
    timestamp: { $gte: oneEightyDaysAgo, $lt: ninetyDaysAgo },
  });
  const activeUsersPrev90dSet = new Set(
    activeUsersPrev90d.map((id) => id.toString())
  );
  const allUsersAsOf30dList = await User.find({
    workspaceId,
    createdAt: { $lt: thirtyDaysAgo },
  }).select('_id');
  const inactiveCountAsOf30d = allUsersAsOf30dList.filter(
    (u) => !activeUsersPrev90dSet.has(u._id.toString())
  ).length;
  const inactiveGrowth =
    inactiveCountAsOf30d > 0
      ? parseFloat(
          (
            ((inactiveCount - inactiveCountAsOf30d) / inactiveCountAsOf30d) *
            100
          ).toFixed(1)
        )
      : 0;

  const inactiveTrend = [];
  for (let i = 5; i >= 0; i--) {
    const dateLimit = new Date(Date.now() - i * 6 * 24 * 60 * 60 * 1000);
    const activityLimit = new Date(
      dateLimit.getTime() - 90 * 24 * 60 * 60 * 1000
    );
    const activeAtThatTime = await AuditLog.distinct('performer', {
      workspaceId,
      timestamp: { $gte: activityLimit, $lte: dateLimit },
    });
    const activeAtThatTimeSet = new Set(
      activeAtThatTime.map((id) => id.toString())
    );
    const usersAtThatTime = await User.find({
      workspaceId,
      createdAt: { $lte: dateLimit },
    }).select('_id');
    const inactiveAtThatTime = usersAtThatTime.filter(
      (u) => !activeAtThatTimeSet.has(u._id.toString())
    ).length;
    inactiveTrend.push({ val: inactiveAtThatTime });
  }

  // 5. Deactivated Users
  const deactivatedCount = await User.countDocuments({
    workspaceId,
    status: 'Deactivated',
  });
  const deactivatedAsOf30d = await User.countDocuments({
    workspaceId,
    status: 'Deactivated',
    updatedAt: { $lt: thirtyDaysAgo },
  });
  const deactivatedGrowth =
    deactivatedAsOf30d > 0
      ? parseFloat(
          (
            ((deactivatedCount - deactivatedAsOf30d) / deactivatedAsOf30d) *
            100
          ).toFixed(1)
        )
      : 0;

  const deactivatedTrend = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(Date.now() - i * 6 * 24 * 60 * 60 * 1000);
    const count = await User.countDocuments({
      workspaceId,
      status: 'Deactivated',
      updatedAt: { $lte: date },
    });
    deactivatedTrend.push({ val: count });
  }

  // 6. MFA Enabled
  const mfaCount = await User.countDocuments({
    workspaceId,
    $or: [
      { githubId: { $exists: true, $ne: null } },
      { clerkUserId: { $exists: true, $ne: null } },
    ],
  });
  const mfaPercentage =
    totalCount > 0 ? Math.round((mfaCount / totalCount) * 100) : 0;

  return {
    totalUsers: { count: totalCount, growth: totalGrowth, trend: totalTrend },
    activeUsers: {
      count: activeCount,
      growth: activeGrowth,
      trend: activeTrend,
    },
    newUsers: { count: newCount, growth: newGrowth, trend: newTrend },
    inactiveUsers: {
      count: inactiveCount,
      growth: inactiveGrowth,
      trend: inactiveTrend,
    },
    deactivatedUsers: {
      count: deactivatedCount,
      growth: deactivatedGrowth,
      trend: deactivatedTrend,
    },
    mfaEnabled: { count: mfaCount, percentage: mfaPercentage },
  };
};

const getWorkspaceTeam = async (
  user,
  isStrategicLead,
  page = 1,
  limit = 20,
  search = '',
  projectId = null
) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  const workspaceId = user.workspaceId;

  // 1. Build queries
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
    const authorizedProjectIds = authorizedProjects.map((p) =>
      p._id.toString()
    );

    if (
      projectId &&
      projectId !== 'unassigned' &&
      !authorizedProjectIds.includes(projectId)
    ) {
      throw new AppError('Unauthorized project access.', 403);
    }
    if (!projectId || projectId === 'unassigned') {
      memberQuery.assignedProjectId = {
        $in: authorizedProjects.map((p) => p._id),
      };
      invitationQuery.projectId = { $in: authorizedProjects.map((p) => p._id) };
    }
  }

  if (projectId) {
    if (projectId === 'unassigned') {
      memberQuery.assignedProjectId = null;
      invitationQuery.projectId = null;
    } else {
      memberQuery.assignedProjectId = projectId;
      invitationQuery.projectId = projectId;
    }
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    memberQuery.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { role: searchRegex },
      { jobTitle: searchRegex },
    ];
    invitationQuery.$or = [{ email: searchRegex }, { role: searchRegex }];
  }

  // 2. Fetch all matching members and invitations to combine and paginate
  const [allMembers, allInvitations] = await Promise.all([
    User.find(memberQuery)
      .select(
        'name email role jobTitle createdAt assignedProjectId profilePicture status githubId clerkUserId updatedAt'
      )
      .populate('assignedProjectId', 'name')
      .sort('name')
      .lean(),
    Invitation.find(invitationQuery).populate('projectId', 'name').lean(),
  ]);

  // Fetch last active times from AuditLogs for all matched members
  const memberIds = allMembers.map((m) => m._id);
  const lastLogs = await AuditLog.aggregate([
    { $match: { performer: { $in: memberIds } } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$performer', lastActive: { $first: '$timestamp' } } },
  ]);
  const lastActiveMap = lastLogs.reduce((acc, log) => {
    acc[log._id.toString()] = log.lastActive;
    return acc;
  }, {});

  // 3. Map members to uniform user items
  const memberItems = allMembers.map((m) => {
    const lastActiveTime =
      lastActiveMap[m._id.toString()] || m.updatedAt || m.createdAt;
    // Determine status (Active, Inactive, Deactivated)
    let displayStatus = m.status || 'Active';
    if (displayStatus !== 'Deactivated') {
      const inactiveThreshold = 14 * 24 * 60 * 60 * 1000; // 14 days
      if (Date.now() - new Date(lastActiveTime).getTime() > inactiveThreshold) {
        displayStatus = 'Inactive';
      }
    }
    return {
      id: m._id,
      name: m.name,
      email: m.email,
      role: m.role,
      jobTitle: m.jobTitle,
      assignedProjectId: m.assignedProjectId,
      status: displayStatus,
      mfaEnabled: !!(m.clerkUserId || m.githubId),
      lastActive: lastActiveTime,
      joinedOn: m.createdAt,
      type: 'member',
      profilePicture: m.profilePicture,
    };
  });

  // 4. Map invitations to uniform user items
  const invitationItems = allInvitations.map((i) => ({
    id: i._id,
    name: i.email.split('@')[0],
    email: i.email,
    role: i.role,
    jobTitle: 'Invited Guest',
    assignedProjectId: i.projectId,
    status: 'Invited',
    mfaEnabled: false,
    lastActive: null,
    joinedOn: i.createdAt || new Date(),
    type: 'invitation',
  }));

  // 5. Combine and Sort (Members first, then invitations)
  const combined = [...memberItems, ...invitationItems];
  combined.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'member' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  // 6. Paginate
  const totalItems = combined.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedItems = combined.slice(startIndex, startIndex + limitNum);

  // 7. Calculate Stats for the workspace
  const stats = await getWorkspaceTeamStats(workspaceId);

  return {
    items: paginatedItems,
    total: totalItems,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(totalItems / limitNum),
    stats,
  };
};

const removeInvitation = async (user, invitationId) => {
  const invitation = await Invitation.findById(invitationId);
  if (!invitation) throw new AppError('Invitation not found', 404);

  if (invitation.workspaceId.toString() !== user.workspaceId.toString()) {
    throw new AppError(
      'Access Denied: Invitation does not belong to your workspace',
      403
    );
  }

  await Invitation.findByIdAndDelete(invitationId);
  return true;
};

const updateMemberProject = async (user, memberId, projectId) => {
  const member = await User.findOne({
    _id: memberId,
    workspaceId: user.workspaceId,
  });
  if (!member) throw new AppError('Member not found', 404);

  const oldProjectId = member.assignedProjectId;

  // 1. Update the User
  member.assignedProjectId = projectId || null;
  await member.save();

  // 2. Remove from old project if exists
  if (oldProjectId) {
    await Project.findByIdAndUpdate(oldProjectId, {
      $pull: { members: memberId },
    });
  }

  // 3. Add to new project if exists
  if (projectId) {
    await Project.findByIdAndUpdate(projectId, {
      $addToSet: { members: memberId },
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
