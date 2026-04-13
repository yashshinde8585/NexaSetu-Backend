const adminService = require('../services/adminService');
const catchAsync = require('../utils/catchAsync');

/**
 * Admin Controller
 * Handles organizational configuration and tenant-level settings.
 */
exports.getAdminDashboard = catchAsync(async (req, res, next) => {
  const workspaceId = req.user.workspaceId;
  const filters = {
    action: req.query.action
  };

  const data = await adminService.getAdminDashboard(workspaceId, filters);

  res.status(200).json({
    status: 'success',
    data
  });
});

/**
 * Update Workspace Settings
 */
exports.updateSettings = catchAsync(async (req, res, next) => {
  const workspaceId = req.user.workspaceId;
  const Workspace = require('../models/Workspace');
  
  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $set: { settings: req.body } },
    { new: true, runValidators: true }
  );

  res.status(200).json({ 
    status: 'success', 
    settings: workspace.settings 
  });
});

/**
 * Invite User to Workspace
 */
exports.inviteUser = catchAsync(async (req, res, next) => {
  const { email, role, projectId } = req.body;
  const workspaceId = req.user.workspaceId;
  const Invitation = require('../models/Invitation');
  const User = require('../models/User');
  const crypto = require('crypto');

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(400).json({ message: 'User already exists in system' });

  // Generate unique token
  const token = crypto.randomBytes(32).toString('hex');

  // Update existing invitation or create a new one
  const invitation = await Invitation.findOneAndUpdate(
    { email, workspaceId },
    { 
      role, 
      projectId, 
      token, 
      invitedBy: req.user._id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    { upsert: true, new: true }
  );

  res.status(201).json({
    status: 'success',
    data: { invitation }
  });
});

/**
 * Deactivate / Activate User
 */
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const { userId, status } = req.body;
  const User = require('../models/User');
  
  await User.findByIdAndUpdate(userId, { status: status });
  
  res.status(200).json({ status: 'success', message: `User ${status}` });
});

/**
 * Manage User Role
 */
exports.updateUserRole = catchAsync(async (req, res, next) => {
  const { userId, role } = req.body;
  const User = require('../models/User');
  
  await User.findByIdAndUpdate(userId, { role });
  
  res.status(200).json({ status: 'success', message: 'User role updated' });
});

/**
 * Create Organizational Team
 */
exports.createTeam = catchAsync(async (req, res, next) => {
  const team = await adminService.createTeam(
    req.user.workspaceId,
    req.user.id,
    req.body
  );

  res.status(201).json({
    status: 'success',
    data: { team }
  });
});

/**
 * Update Organizational Team
 */
exports.updateTeam = catchAsync(async (req, res, next) => {
  const team = await adminService.updateTeam(
    req.user.workspaceId,
    req.user.id,
    req.params.id,
    req.body
  );

  res.status(200).json({
    status: 'success',
    data: { team }
  });
});

/**
 * Remove Organizational Team
 */
exports.deleteTeam = catchAsync(async (req, res, next) => {
  await adminService.deleteTeam(
    req.user.workspaceId,
    req.user.id,
    req.params.id
  );

  res.status(200).json({
    status: 'success',
    message: 'Team successfully decommissioned'
  });
});

/**
 * Update role permissions
 */
exports.updateRolePermissions = catchAsync(async (req, res, next) => {
  const { role, permissions } = req.body;
  const workspaceId = req.user.workspaceId;

  const rolePermissions = await adminService.updateRolePermissions(
    workspaceId,
    req.user.id,
    role,
    permissions
  );

  res.status(200).json({
    status: 'success',
    data: { rolePermissions }
  });
});

/**
 * Create New Organizational Role
 */
exports.createRole = catchAsync(async (req, res, next) => {
  const { roleName, permissions } = req.body;
  const workspaceId = req.user.workspaceId;

  const result = await adminService.createRole(
    workspaceId,
    req.user.id,
    roleName,
    permissions
  );

  res.status(201).json({
    status: 'success',
    data: result
  });
});
