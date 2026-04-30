const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const AuditLog = require('../models/AuditLog');
const Project = require('../models/Project');
const Team = require('../models/Team');
const teamService = require('./teamService');
const dashboardService = require('./dashboardService');
const healthService = require('./observability/healthService');
const AppError = require('../utils/appError');

// Internal Helpers
const formatOverview = (workspace, users, projectsData, health) => {
  const activeRoles = [...new Set(users.map(u => u.role))];
  
  // Calculate aggregate metrics from projects
  const avgHealth = projectsData.length > 0 
    ? Math.round(projectsData.reduce((sum, p) => sum + p.healthScore, 0) / projectsData.length)
    : 100;
    
  const avgProgress = projectsData.length > 0
    ? Math.round(projectsData.reduce((sum, p) => sum + p.percentage, 0) / projectsData.length)
    : 0;

  const highRiskCount = projectsData.filter(p => p.riskLevel === 'High').length;

  return {
    name: workspace?.name || 'NexaSetu Org',
    totalUsers: users.length,
    activeRoles: activeRoles.length,
    integrations: Object.values(workspace?.integrations || {}).filter(i => i.connected).length,
    status: health?.status || 'HEALTHY',
    healthScore: avgHealth,
    progress: avgProgress,
    riskLevel: highRiskCount > 0 ? 'HIGH' : 'LOW',
    capacity: '85%' // Placeholder for now as capacity logic is complex
  };
};

const formatUsers = (users, teams) => {
  return users
    .filter(u => u.role !== 'WORKSPACE_ADMIN')
    .map(u => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status || 'Active',
      lastActive: u.lastActive || u.updatedAt,
      teams: teams.filter(t => t.members.some(m => m.toString() === u._id.toString())).map(t => t.name)
    }));
};

const formatIntegrations = (workspace) => {
  return [
    { name: 'GitHub', icon: 'github', status: workspace?.integrations?.github?.connected ? 'connected' : 'disconnected' },
    { name: 'Slack', icon: 'slack', status: workspace?.integrations?.slack?.connected ? 'connected' : 'disconnected' }
  ];
};

const formatTeams = (teams) => {
  return teams.map(t => ({
    id: t._id,
    name: t.name,
    members: t.members?.length || 0,
    lead: t.lead?.name || 'Unassigned',
    status: t.status
  }));
};

const formatSettings = (workspace) => {
  return {
    timezone: workspace?.settings?.timezone || 'UTC +5:30',
    workingHours: workspace?.settings?.workingHours || '09:00 - 18:00',
    notificationRules: workspace?.settings?.notificationRules || 'Email, Slack',
    projectDefaults: workspace?.settings?.projectDefaults || 'Sprint: 14 days'
  };
};

const formatLogs = (logs) => {
  return logs.map(l => ({
    id: l._id,
    performer: l.performer?.name || 'System',
    action: l.action,
    time: l.timestamp
  }));
};

const getRecentLogs = async (workspaceId, action) => {
  const query = { workspaceId };
  if (action) query.action = action;
  return AuditLog.find(query).sort('-timestamp').limit(20).populate('performer', 'name').lean();
};

const getUsageStats = async (workspaceId) => {
  const dayAgo = new Date(Date.now() - 24*60*60*1000);
  const [dailyLogins, totalApiCalls] = await Promise.all([
    AuditLog.countDocuments({ workspaceId, action: 'LOGIN', timestamp: { $gte: dayAgo } }),
    AuditLog.countDocuments({ workspaceId, timestamp: { $gte: dayAgo } })
  ]);
  return { dailyLogins, apiCalls: totalApiCalls };
};

const getSystemAlerts = (workspace) => {
  return [
    { type: 'info', message: 'User invited: Demo (Intern)' },
    { type: 'warning', message: 'GitHub integration requires token refresh in 3 days.' }
  ];
};

const getRolePermissionsDefinitions = (overrides = {}) => {
  const { ROLE_PERMISSIONS } = require('../config/permissions');
  const nativeRoles = Object.keys(ROLE_PERMISSIONS);
  const allRoleKeys = [...new Set([
    ...nativeRoles,
    ...(overrides instanceof Map ? Array.from(overrides.keys()) : Object.keys(overrides))
  ])];
  
  return allRoleKeys.map(role => ({
    role,
    permissions: (overrides instanceof Map ? overrides.get(role) : overrides[role]) || ROLE_PERMISSIONS[role] || [],
    isCustom: !nativeRoles.includes(role),
    isNative: nativeRoles.includes(role)
  }));
};

// Exported Service Methods
const getAdminDashboard = async (workspaceId, filters = {}) => {
  const [workspace, users, logs, teams, health] = await Promise.all([
    Workspace.findById(workspaceId).select('name subscription settings rolePermissions integrations').lean(),
    User.find({ workspaceId }).select('name email role status updatedAt lastActive githubAccessToken').lean(),
    getRecentLogs(workspaceId, filters.action),
    Team.find({ workspaceId }).populate('lead', 'name').lean(),
    healthService.getSystemHealth()
  ]);

  const { PERMISSIONS } = require('../config/permissions');

  // Fetch project metrics using dashboardService
  // Mock user for dashboardService context
  const mockAdminUser = { _id: workspaceId, role: 'WORKSPACE_ADMIN', workspaceId };
  const { projects: projectsData } = await dashboardService.getDashboardStats(mockAdminUser);

  return {
    overview: formatOverview(workspace, users, projectsData, health),
    users: formatUsers(users, teams),
    roles: getRolePermissionsDefinitions(workspace?.rolePermissions || {}),
    availablePermissions: Object.values(PERMISSIONS),
    integrations: formatIntegrations(workspace),
    teams: formatTeams(teams),
    settings: formatSettings(workspace),
    securityLogs: formatLogs(logs),
    usage: await getUsageStats(workspaceId),
    alerts: getSystemAlerts(workspace)
  };
};

const updateRolePermissions = async (workspaceId, performerId, role, permissions) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace.rolePermissions) workspace.rolePermissions = new Map();
  workspace.rolePermissions.set(role, permissions);
  await workspace.save();

  await AuditLog.create({
    workspaceId,
    performer: performerId,
    action: 'ROLE_UPDATE',
    entityType: 'ROLE',
    details: `Updated permissions for role: ${role}`
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
    details: `Created new organizational role: ${normalizedName}`
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
    details: `Created team: ${team.name}`
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
    details: `Updated team: ${team.name}`
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
      details: `Deleted team: ${team.name}`
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
    details: `Updated user status to: ${status}`
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
    details: `Updated user role to: ${role}`
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
