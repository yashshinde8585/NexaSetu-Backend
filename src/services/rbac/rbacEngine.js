const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const User = require('../../models/User');

class RbacEngine {
  async getRoles() {
    return Role.find().populate('permissions');
  }

  async createRole(name, description, permissionIds) {
    const role = new Role({ name, description, permissions: permissionIds });
    return role.save();
  }

  async updateRole(id, updates) {
    return Role.findByIdAndUpdate(id, updates, { new: true });
  }

  async getPermissions() {
    return Permission.find();
  }

  async createPermission(action, description) {
    const permission = new Permission({ action, description });
    return permission.save();
  }
}

module.exports = new RbacEngine();
