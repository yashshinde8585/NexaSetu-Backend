const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const AuditLog = require('../models/AuditLog');
const Project = require('../models/Project');
const Team = require('../models/Team');
const Invitation = require('../models/Invitation');
const ActionRequest = require('../models/ActionRequest');
const AILog = require('../models/AILog');
const Task = require('../models/Task');
const teamService = require('./teamService');
const dashboardService = require('./dashboardService');
const healthService = require('./observability/healthService');
const AppError = require('../utils/appError');

// Internal Helpers
const formatOverview = (
  workspace,
  users,
  projectsData,
  health,
  activeTasksCount
) => {
  const activeRoles = [...new Set(users.map((u) => u.role))];

  // Calculate aggregate metrics from projects
  const avgHealth =
    projectsData.length > 0
      ? Math.round(
          projectsData.reduce((sum, p) => sum + p.healthScore, 0) /
            projectsData.length
        )
      : 100;

  const avgProgress =
    projectsData.length > 0
      ? Math.round(
          projectsData.reduce((sum, p) => sum + p.percentage, 0) /
            projectsData.length
        )
      : 0;

  const highRiskCount = projectsData.filter(
    (p) => p.riskLevel === 'High'
  ).length;

  // Calculate dynamic capacity based on active tasks vs team capacity (3 tasks per user is standard load)
  const capacityPercent = Math.min(
    100,
    Math.round((activeTasksCount / Math.max(1, users.length * 3)) * 100)
  );

  return {
    name: workspace?.name || 'NexaSetu Org',
    totalUsers: users.length,
    activeRoles: activeRoles.length,
    integrations: Object.values(workspace?.integrations || {}).filter(
      (i) => i.connected
    ).length,
    status: health?.status || 'HEALTHY',
    healthScore: avgHealth,
    progress: avgProgress,
    riskLevel: highRiskCount > 0 ? 'HIGH' : 'LOW',
    capacity: `${capacityPercent}%`,
  };
};

const formatUsers = (users, teams) => {
  return users
    .filter((u) => u.role !== 'WORKSPACE_ADMIN')
    .map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status || 'Active',
      lastActive: u.lastActive || u.updatedAt,
      teams: teams
        .filter((t) => t.members.some((m) => m.toString() === u._id.toString()))
        .map((t) => t.name),
    }));
};

const formatIntegrations = (workspace) => {
  return [
    {
      name: 'GitHub',
      icon: 'github',
      status: workspace?.integrations?.github?.connected
        ? 'connected'
        : 'disconnected',
    },
    {
      name: 'Slack',
      icon: 'slack',
      status: workspace?.integrations?.slack?.connected
        ? 'connected'
        : 'disconnected',
    },
  ];
};

const formatTeams = (teams) => {
  return teams.map((t) => ({
    id: t._id,
    name: t.name,
    members: t.members?.length || 0,
    lead: t.lead?.name || 'Unassigned',
    status: t.status,
  }));
};

const formatSettings = (workspace) => {
  return {
    timezone: workspace?.settings?.timezone || 'UTC +5:30',
    workingHours: workspace?.settings?.workingHours || '09:00 - 18:00',
    notificationRules: workspace?.settings?.notificationRules || 'Email, Slack',
    projectDefaults: workspace?.settings?.projectDefaults || 'Sprint: 14 days',
  };
};

const formatLogs = (logs) => {
  return logs.map((l) => ({
    id: l._id,
    performer: l.performer?.name || 'System',
    action: l.action,
    time: l.timestamp,
    ip: l.ip || 'Internal',
  }));
};

const getRecentLogs = async (workspaceId, action) => {
  const query = { workspaceId };
  if (action) query.action = action;
  return AuditLog.find(query)
    .sort('-timestamp')
    .limit(20)
    .populate('performer', 'name')
    .lean();
};

const getUsageStats = async (workspaceId, workspace) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [dailyLogins, apiCalls30d, aiLogsCount30d] = await Promise.all([
    AuditLog.countDocuments({
      workspaceId,
      action: 'LOGIN',
      timestamp: { $gte: dayAgo },
    }),
    AuditLog.countDocuments({
      workspaceId,
      timestamp: { $gte: thirtyDaysAgo },
    }),
    AILog.countDocuments({ workspaceId, timestamp: { $gte: thirtyDaysAgo } }),
  ]);

  const storageUsed = workspace?.subscription?.storageUsed || 0;
  const storageQuota = workspace?.subscription?.storageQuota || 104857600; // 100MB Default

  return {
    dailyLogins,
    apiCalls: apiCalls30d,
    aiUsage: aiLogsCount30d,
    storageUsed,
    storageQuota,
  };
};

const getSystemAlerts = (workspace) => {
  const alerts = [];
  if (
    workspace?.integrations?.github &&
    !workspace.integrations.github.connected
  ) {
    alerts.push({
      type: 'warning',
      message: 'GitHub integration is currently offline.',
    });
  }
  if (
    workspace?.integrations?.slack &&
    !workspace.integrations.slack.connected
  ) {
    alerts.push({
      type: 'info',
      message: 'Slack notifications are not configured.',
    });
  }
  return alerts.length > 0
    ? alerts
    : [{ type: 'info', message: 'All integration channels synced.' }];
};

const getRolePermissionsDefinitions = (overrides = {}) => {
  const { ROLE_PERMISSIONS } = require('../config/permissions');
  const nativeRoles = Object.keys(ROLE_PERMISSIONS);
  const allRoleKeys = [
    ...new Set([
      ...nativeRoles,
      ...(overrides instanceof Map
        ? Array.from(overrides.keys())
        : Object.keys(overrides)),
    ]),
  ];

  return allRoleKeys.map((role) => ({
    role,
    permissions:
      (overrides instanceof Map ? overrides.get(role) : overrides[role]) ||
      ROLE_PERMISSIONS[role] ||
      [],
    isCustom: !nativeRoles.includes(role),
    isNative: nativeRoles.includes(role),
  }));
};

// Generates cumulative user growth trend using creation dates
const getUsersGrowthTrend = (users) => {
  const sortedUsers = [...users].sort(
    (a, b) =>
      new Date(a.createdAt || a.updatedAt) -
      new Date(b.createdAt || b.updatedAt)
  );

  const trendMap = new Map();
  let runningTotal = 0;

  sortedUsers.forEach((u) => {
    const dateObj = new Date(u.createdAt || u.updatedAt);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    runningTotal += 1;
    trendMap.set(dateStr, runningTotal);
  });

  return Array.from(trendMap.entries())
    .map(([date, count]) => ({
      date,
      users: count,
    }))
    .slice(-10);
};

// Generates projects growth trend based on creation dates
const getProjectsTrend = async (workspaceId) => {
  const projects = await Project.find({ workspaceId })
    .select('createdAt')
    .lean();
  const sorted = [...projects].sort(
    (a, b) =>
      new Date(a.createdAt || Date.now()) - new Date(b.createdAt || Date.now())
  );

  const trendMap = new Map();
  let runningTotal = 0;

  sorted.forEach((p) => {
    const dateObj = new Date(p.createdAt || Date.now());
    const dateStr = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    runningTotal += 1;
    trendMap.set(dateStr, runningTotal);
  });

  return Array.from(trendMap.entries())
    .map(([date, count]) => ({
      date,
      val: count,
    }))
    .slice(-6);
};

// Generates login active user counts grouped by day for last 7 days
const getActiveUsersTrend = async (workspaceId) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const logs = await AuditLog.find({
    workspaceId,
    action: 'LOGIN',
    timestamp: { $gte: sevenDaysAgo },
  })
    .select('timestamp')
    .lean();

  const trendMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    trendMap.set(key, 0);
  }

  logs.forEach((l) => {
    const key = new Date(l.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    if (trendMap.has(key)) {
      trendMap.set(key, trendMap.get(key) + 1);
    }
  });

  return Array.from(trendMap.entries()).map(([date, count]) => ({
    date,
    val: count,
  }));
};

// Generates administrative role registration growth
const getAdminsTrend = (users) => {
  const admins = users.filter((u) => u.role && u.role.includes('ADMIN'));
  const sorted = [...admins].sort(
    (a, b) =>
      new Date(a.createdAt || a.updatedAt) -
      new Date(b.createdAt || b.updatedAt)
  );

  const trendMap = new Map();
  let runningTotal = 0;

  sorted.forEach((u) => {
    const dateObj = new Date(u.createdAt || u.updatedAt);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    runningTotal += 1;
    trendMap.set(dateStr, runningTotal);
  });

  return Array.from(trendMap.entries())
    .map(([date, count]) => ({
      date,
      val: count,
    }))
    .slice(-6);
};

// Exported Service Methods
const getAdminDashboard = async (workspaceId, filters = {}) => {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [
    workspace,
    users,
    logs,
    teams,
    health,
    projects,
    pendingInvitations,
    pendingActionRequests,
    deactivatedUsersCount,
    aiLogsCount,
    activeTasksCount,
    totalUsersCount,
    mfaUsersCount,
    inactiveUsersCount,
    suspiciousLoginsCount,
  ] = await Promise.all([
    Workspace.findById(workspaceId)
      .select('name subscription settings rolePermissions integrations')
      .lean(),
    User.find({ workspaceId })
      .select(
        'name email role status updatedAt lastActive githubAccessToken createdAt'
      )
      .lean(),
    getRecentLogs(workspaceId, filters.action),
    Team.find({ workspaceId }).populate('lead', 'name').lean(),
    healthService.getSystemHealth(),
    Project.find({ workspaceId })
      .select('name status type members createdAt')
      .lean(),
    Invitation.countDocuments({ workspaceId, status: 'pending' }),
    ActionRequest.countDocuments({ status: 'pending' }),
    User.countDocuments({ workspaceId, status: 'Deactivated' }),
    AILog.countDocuments({ workspaceId }),
    Task.countDocuments({ workspaceId, status: { $ne: 'done' } }),
    User.countDocuments({ workspaceId }),
    User.countDocuments({
      workspaceId,
      $or: [
        { githubId: { $exists: true, $ne: null } },
        { clerkUserId: { $exists: true, $ne: null } },
      ],
    }),
    User.countDocuments({ workspaceId, updatedAt: { $lt: ninetyDaysAgo } }),
    User.countDocuments({ workspaceId, failedLoginAttempts: { $gt: 3 } }),
  ]);

  const { PERMISSIONS } = require('../config/permissions');

  // Fetch project metrics using dashboardService
  const mockAdminUser = {
    _id: workspaceId,
    role: 'WORKSPACE_ADMIN',
    workspaceId,
  };
  const { projects: projectsData } =
    await dashboardService.getDashboardStats(mockAdminUser);

  // Compute projects list statistics dynamically
  const projectsList = projects.map((p) => ({
    name: p.name,
    type: p.type || 'Product Development',
    users: p.members?.length || 0,
    status: p.status || 'active',
  }));

  // Build authentic analytics growth trends
  const usersGrowthTrend = getUsersGrowthTrend(users);
  const projectsTrend = await getProjectsTrend(workspaceId);
  const activeUsersTrend = await getActiveUsersTrend(workspaceId);
  const adminsTrend = getAdminsTrend(users);

  const usageStats = await getUsageStats(workspaceId, workspace);
  const ssoWorkspacesCount =
    workspace?.integrations?.github?.connected ||
    workspace?.integrations?.slack?.connected
      ? 1
      : 0;

  return {
    overview: formatOverview(
      workspace,
      users,
      projectsData,
      health,
      activeTasksCount
    ),
    users: formatUsers(users, teams),
    roles: getRolePermissionsDefinitions(workspace?.rolePermissions || {}),
    availablePermissions: Object.values(PERMISSIONS),
    integrations: formatIntegrations(workspace),
    teams: formatTeams(teams),
    settings: formatSettings(workspace),
    securityLogs: formatLogs(logs),
    usage: usageStats,
    alerts: getSystemAlerts(workspace),
    projectsOverview: projectsList,
    pendingApprovals: {
      pendingInvitations,
      pendingActionRequests,
      deactivatedUsersCount,
      aiLogsCount,
    },
    usersGrowthTrend,
    analyticsTrends: {
      projects: projectsTrend,
      users: usersGrowthTrend.map((pt) => ({ val: pt.users })),
      activeUsers: activeUsersTrend,
      admins: adminsTrend,
    },
    securityOverview: {
      ssoEnforcedWorkspaces: ssoWorkspacesCount,
      totalWorkspaces: 1,
      mfaEnabledUsers: mfaUsersCount,
      totalUsers: totalUsersCount,
      inactiveUsers: inactiveUsersCount,
      suspiciousLogins: suspiciousLoginsCount,
    },
  };
};

const updateRolePermissions = async (
  workspaceId,
  performerId,
  role,
  permissions
) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace.rolePermissions) workspace.rolePermissions = new Map();
  workspace.rolePermissions.set(role, permissions);
  await workspace.save();

  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'ROLE_UPDATE',
    entityType: 'ROLE',
    details: `Updated permissions for role: ${role}`,
  });

  return workspace.rolePermissions;
};

const getRoleDefinitions = async (workspaceId) => {
  const workspace = await Workspace.findById(workspaceId);
  return getRolePermissionsDefinitions(workspace?.rolePermissions || {});
};

const createRole = async (workspaceId, performerId, roleName, permissions) => {
  const workspace = await Workspace.findById(workspaceId);
  const normalizedName = roleName.trim().toUpperCase().replace(/ /g, '_');
  if (!workspace.rolePermissions) workspace.rolePermissions = new Map();
  workspace.rolePermissions.set(normalizedName, permissions);
  await workspace.save();

  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'ROLE_CREATE',
    entityType: 'ROLE',
    details: `Created new organizational role: ${normalizedName}`,
  });

  return { role: normalizedName, permissions };
};

const createTeam = async (workspaceId, performerId, teamData) => {
  const team = await Team.create({ ...teamData, workspaceId });
  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'TEAM_CREATE',
    entityType: 'TEAM',
    entityId: team._id,
    details: `Created team: ${team.name}`,
  });
  return team;
};

const updateTeam = async (workspaceId, performerId, teamId, updateData) => {
  const team = await Team.findOneAndUpdate(
    { _id: teamId, workspaceId },
    updateData,
    { new: true, runValidators: true }
  );
  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'TEAM_UPDATE',
    entityType: 'TEAM',
    entityId: team._id,
    details: `Updated team: ${team.name}`,
  });
  return team;
};

const deleteTeam = async (workspaceId, performerId, teamId) => {
  const team = await Team.findOneAndDelete({ _id: teamId, workspaceId });
  if (team) {
    await AuditLog.create({
      workspaceId,
      performer: performerId,
      action: 'TEAM_DELETE',
      entityType: 'TEAM',
      entityId: team._id,
      details: `Deleted team: ${team.name}`,
    });
  }
  return team;
};

const inviteUser = async (workspaceId, performerId, email, role, projectId) => {
  const result = await teamService.provisionUser(
    { email, role, projectId },
    workspaceId,
    performerId,
    'BIRTH'
  );
  return result.user || result.invitation;
};

const deactivateUser = async (workspaceId, performerId, userId, status) => {
  if (typeof userId === 'object') {
    // Attempt to recover if the entire body was passed as userId
    userId = userId.userId || userId.id;
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, workspaceId },
    { status },
    { new: true }
  );

  if (!user) throw new AppError('User not found in this workspace', 404);

  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'USER_DEACTIVATE',
    entityType: 'USER',
    entityId: user._id,
    details: `Updated user status to: ${status}`,
  });

  return user;
};

const updateUserRole = async (workspaceId, performerId, userId, role) => {
  if (typeof userId === 'object') {
    userId = userId.userId || userId.id;
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, workspaceId },
    { role },
    { new: true }
  );

  if (!user) throw new AppError('User not found in this workspace', 404);

  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'USER_ROLE_UPDATE',
    entityType: 'USER',
    entityId: user._id,
    details: `Updated user role to: ${role}`,
  });

  return user;
};

module.exports = {
  getAdminDashboard,
  updateRolePermissions,
  getRoleDefinitions,
  createRole,
  createTeam,
  updateTeam,
  deleteTeam,
  inviteUser,
  deactivateUser,
  updateUserRole,
};
