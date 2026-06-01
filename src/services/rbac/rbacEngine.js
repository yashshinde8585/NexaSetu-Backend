const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const User = require('../../models/User');

const getRoles = async () => {
  return Role.find().populate('permissions');
};

const createRole = async (name, description, permissionIds) => {
  const role = new Role({ name, description, permissions: permissionIds });
  return role.save();
};

const updateRole = async (id, updates) => {
  return Role.findByIdAndUpdate(id, updates, { new: true });
};

const getPermissions = async () => {
  return Permission.find();
};

const createPermission = async (action, description) => {
  const permission = new Permission({ action, description });
  return permission.save();
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  getPermissions,
  createPermission,
};
