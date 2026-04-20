const adminService = require('../services/adminService');
const workspaceService = require('../services/workspaceService');
const catchAsync = require('../utils/catchAsync');

// Retrieve comprehensive admin dashboard metrics
exports.getAdminDashboard = catchAsync(async (req, res, next) => {
  const workspaceId = req.user.workspaceId;
  const filters = { action: req.query.action };
  const data = await adminService.getAdminDashboard(workspaceId, filters);

  res.status(200).json({ status: 'success', data });
});

// Update workspace settings
exports.updateSettings = catchAsync(async (req, res, next) => {
  const settings = await workspaceService.updateSettings(req.user.workspaceId, req.body);
  res.status(200).json({ status: 'success', settings });
});

// Invite a new user to the workspace
exports.inviteUser = catchAsync(async (req, res, next) => {
  const { email, role, projectId } = req.body;
  const invitation = await adminService.inviteUser(req.user.workspaceId, req.user._id, email, role, projectId);
  res.status(201).json({ status: 'success', data: { invitation } });
});

// Deactivate or activate a user account
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const { userId, status } = req.body;
  await adminService.deactivateUser(req.user.workspaceId, req.user._id, userId, status);
  res.status(200).json({ status: 'success', message: `User ${status}` });
});

// Update a user's role
exports.updateUserRole = catchAsync(async (req, res, next) => {
  const { userId, role } = req.body;
  await adminService.updateUserRole(req.user.workspaceId, req.user._id, userId, role);
  res.status(200).json({ status: 'success', message: 'User role updated' });
});

// Create a new organizational team
exports.createTeam = catchAsync(async (req, res, next) => {
  const team = await adminService.createTeam(req.user.workspaceId, req.user.id, req.body);
  res.status(201).json({ status: 'success', data: { team } });
});

// Update an existing organizational team
exports.updateTeam = catchAsync(async (req, res, next) => {
  const team = await adminService.updateTeam(req.user.workspaceId, req.user.id, req.params.id, req.body);
  res.status(200).json({ status: 'success', data: { team } });
});

// Remove an organizational team
exports.deleteTeam = catchAsync(async (req, res, next) => {
  await adminService.deleteTeam(req.user.workspaceId, req.user.id, req.params.id);
  res.status(200).json({ status: 'success', message: 'Team successfully decommissioned' });
});

// Update organizational role permissions
exports.updateRolePermissions = catchAsync(async (req, res, next) => {
  const { role, permissions } = req.body;
  const rolePermissions = await adminService.updateRolePermissions(req.user.workspaceId, req.user.id, role, permissions);
  res.status(200).json({ status: 'success', data: { rolePermissions } });
});

// Create a new organizational role
exports.createRole = catchAsync(async (req, res, next) => {
  const { roleName, permissions } = req.body;
  const result = await adminService.createRole(req.user.workspaceId, req.user.id, roleName, permissions);
  res.status(201).json({ status: 'success', data: result });
});
