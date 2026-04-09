const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const AuditLog = require('../models/AuditLog');
const Project = require('../models/Project');
const Team = require('../models/Team');

/**
 * Admin Service - Handles administrative configuration and monitoring.
 */
class AdminService {
  /**
   * Fetches the comprehensive system control panel data.
   */
  async getAdminDashboard(workspaceId, filters = {}) {
    const logQuery = { workspaceId };
    if (filters.action) logQuery.action = filters.action;

    const [workspace, users, logs, teams] = await Promise.all([
      Workspace.findById(workspaceId).select('name subscription settings rolePermissions integrations').lean(),
      User.find({ workspaceId }).select('name email role status updatedAt lastActive githubAccessToken').lean(),
      AuditLog.find(logQuery).sort('-timestamp').limit(20).populate('performer', 'name').lean(),
      Team.find({ workspaceId }).populate('lead', 'name').lean()
    ]);

    // Active Roles calculation
    const activeRoles = [...new Set(users.map(u => u.role))];
    
    // Usage Stats
    const usage = {
      activeUsers: users.length,
      dailyLogins: await AuditLog.countDocuments({ workspaceId, action: 'LOGIN', timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) } }),
      apiCalls: await AuditLog.countDocuments({ workspaceId, timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) } })
    };

    const { PERMISSIONS, ROLE_PERMISSIONS } = require('../config/permissions');

    return {
      overview: {
        name: workspace?.name || 'NexaSetu Org',
        totalUsers: users.length,
        activeRoles: activeRoles.length,
        integrations: 2,
        status: 'Healthy'
      },
      users: users
        .filter(u => u.role !== 'WORKSPACE_ADMIN')
        .map(u => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status || 'Active',
          lastActive: u.lastActive || u.updatedAt,
          teams: realTeams.filter(t => t.members.some(m => m.toString() === u._id.toString())).map(t => t.name)
        })),
      roles: this._getRolePermissionsDefinitions(workspace?.rolePermissions || {}),
      availablePermissions: Object.values(PERMISSIONS),
      integrations: [
        { 
          name: 'GitHub', 
          icon: 'github', 
          status: workspace?.integrations?.github?.connected ? 'connected' : 'disconnected' 
        },
        { 
          name: 'Slack', 
          icon: 'slack', 
          status: workspace?.integrations?.slack?.connected ? 'connected' : 'disconnected' 
        }
      ],
      teams: realTeams.map(t => ({
        id: t._id,
        name: t.name,
        members: t.members?.length || 0,
        lead: t.lead?.name || 'Unassigned',
        status: t.status
      })),
      integrations: [
        { name: 'GitHub', status: 'connected', icon: 'github' },
        { name: 'Slack', status: 'connected', icon: 'slack' }
      ],
      settings: {
        timezone: workspace?.settings?.timezone || 'UTC +5:30',
        workingHours: workspace?.settings?.workingHours || '09:00 - 18:00',
        notificationRules: workspace?.settings?.notificationRules || 'Email, Slack',
        projectDefaults: workspace?.settings?.projectDefaults || 'Sprint: 14 days'
      },
      securityLogs: logs.map(l => ({
        id: l._id,
        performer: l.performer?.name || 'System',
        action: l.action,
        time: l.timestamp
      })),
      usage,
      alerts: [
        { type: 'info', message: 'User invited: Demo (Intern)' },
        { type: 'warning', message: 'GitHub integration requires token refresh in 3 days.' }
      ]
    };
  }

  async updateRolePermissions(workspaceId, performerId, role, permissions) {
    const workspace = await Workspace.findById(workspaceId);
    
    // Initialize map if needed
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

  async getRoleDefinitions(workspaceId) {
    const workspace = await Workspace.findById(workspaceId);
    return this._getRolePermissionsDefinitions(workspace?.rolePermissions || {});
  }

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

  async createRole(workspaceId, performerId, roleName, permissions) {
    const workspace = await Workspace.findById(workspaceId);
    
    // Normalize role name
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

  /**
   * Create a new team in the workspace
   */
  async createTeam(workspaceId, performerId, teamData) {
    const team = await Team.create({
      ...teamData,
      workspaceId
    });

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

  /**
   * Update an existing team
   */
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
}

module.exports = new AdminService();
