const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const AuditLog = require('../models/AuditLog');
const Project = require('../models/Project');
const Team = require('../models/Team');
const teamService = require('./teamService');
const AppError = require('../utils/appError');

class AdminService {
  // Fetch comprehensive dashboard metrics and data for administrators
  async getAdminDashboard(workspaceId, filters = {}) {
    const [workspace, users, logs, teams] = await Promise.all([
      Workspace.findById(workspaceId).select('name subscription settings rolePermissions integrations').lean(),
      User.find({ workspaceId }).select('name email role status updatedAt lastActive githubAccessToken').lean(),
      this._getRecentLogs(workspaceId, filters.action),
      Team.find({ workspaceId }).populate('lead', 'name').lean()
    ]);

    const { PERMISSIONS } = require('../config/permissions');

    return {
      overview: this._formatOverview(workspace, users),
      users: this._formatUsers(users, teams),
      roles: this._getRolePermissionsDefinitions(workspace?.rolePermissions || {}),
      availablePermissions: Object.values(PERMISSIONS),
      integrations: this._formatIntegrations(workspace),
      teams: this._formatTeams(teams),
      settings: this._formatSettings(workspace),
      securityLogs: this._formatLogs(logs),
      usage: await this._getUsageStats(workspaceId),
      alerts: this._getSystemAlerts(workspace)
    };
  }

  // Aggregate high-level organization status
  _formatOverview(workspace, users) {
    const activeRoles = [...new Set(users.map(u => u.role))];
    return {
      name: workspace?.name || 'NexaSetu Org',
      totalUsers: users.length,
      activeRoles: activeRoles.length,
      integrations: 2,
      status: 'Healthy'
    };
  }

  // Filter and format user list with team associations
  _formatUsers(users, teams) {
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
  }

  // Format workspace integration connection statuses
  _formatIntegrations(workspace) {
    return [
      { name: 'GitHub', icon: 'github', status: workspace?.integrations?.github?.connected ? 'connected' : 'disconnected' },
      { name: 'Slack', icon: 'slack', status: workspace?.integrations?.slack?.connected ? 'connected' : 'disconnected' }
    ];
  }

  // Format team list for administrative overview
  _formatTeams(teams) {
    return teams.map(t => ({
      id: t._id,
      name: t.name,
      members: t.members?.length || 0,
      lead: t.lead?.name || 'Unassigned',
      status: t.status
    }));
  }

  // Extract and default workspace operational settings
  _formatSettings(workspace) {
    return {
      timezone: workspace?.settings?.timezone || 'UTC +5:30',
      workingHours: workspace?.settings?.workingHours || '09:00 - 18:00',
      notificationRules: workspace?.settings?.notificationRules || 'Email, Slack',
      projectDefaults: workspace?.settings?.projectDefaults || 'Sprint: 14 days'
    };
  }

  // Format audit logs for security monitoring feed
  _formatLogs(logs) {
    return logs.map(l => ({
      id: l._id,
      performer: l.performer?.name || 'System',
      action: l.action,
      time: l.timestamp
    }));
  }

  // Retrieve most recent security and administrative events
  async _getRecentLogs(workspaceId, action) {
    const query = { workspaceId };
    if (action) query.action = action;
    return AuditLog.find(query).sort('-timestamp').limit(20).populate('performer', 'name').lean();
  }

  // Calculate 24-hour operational usage metrics
  async _getUsageStats(workspaceId) {
    const dayAgo = new Date(Date.now() - 24*60*60*1000);
    const [dailyLogins, totalApiCalls] = await Promise.all([
      AuditLog.countDocuments({ workspaceId, action: 'LOGIN', timestamp: { $gte: dayAgo } }),
      AuditLog.countDocuments({ workspaceId, timestamp: { $gte: dayAgo } })
    ]);
    return { dailyLogins, apiCalls: totalApiCalls };
  }

  // Identify active system alerts and warnings
  _getSystemAlerts(workspace) {
    return [
      { type: 'info', message: 'User invited: Demo (Intern)' },
      { type: 'warning', message: 'GitHub integration requires token refresh in 3 days.' }
    ];
  }

  // Modify organizational role permissions and audit the change
  async updateRolePermissions(workspaceId, performerId, role, permissions) {
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
  }

  // Fetch defined roles and their effective permissions
  async getRoleDefinitions(workspaceId) {
    const workspace = await Workspace.findById(workspaceId);
    return this._getRolePermissionsDefinitions(workspace?.rolePermissions || {});
  }

  // Merge native and custom role permission definitions
  _getRolePermissionsDefinitions(overrides = {}) {
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
  }

  // Register a new custom role within the workspace
  async createRole(workspaceId, performerId, roleName, permissions) {
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
  }

  // Create a new functional team
  async createTeam(workspaceId, performerId, teamData) {
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
  }

  // Update team metadata or membership
  async updateTeam(workspaceId, performerId, teamId, updateData) {
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
  }

  // Remove a team from the organization
  async deleteTeam(workspaceId, performerId, teamId) {
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
  }

  // Invite a new user to the workspace
  async inviteUser(workspaceId, performerId, email, role, projectId) {
    const result = await teamService.provisionUser(
      { email, role, projectId },
      workspaceId,
      performerId,
      'BIRTH'
    );
    return result.user || result.invitation;
  }

  // Deactivate or activate a user account
  async deactivateUser(workspaceId, performerId, userId, status) {
    const user = await User.findByIdAndUpdate(userId, { status: status }, { new: true });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  // Update a user's role
  async updateUserRole(workspaceId, performerId, userId, role) {
    const user = await User.findByIdAndUpdate(userId, { role }, { new: true });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }
}

module.exports = new AdminService();
