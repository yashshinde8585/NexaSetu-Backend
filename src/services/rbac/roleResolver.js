const User = require('../../models/User');
const Role = require('../../models/Role');

const getUserRoles = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return [];
  
  // Fallback mapping for existing string roles to new model or simply map
  // For now, if role is a string, we assume they have a role with that name
  const role = await Role.findOne({ name: user.role }).populate('permissions');
  
  if (!role) {
    // Default fallback
    return [];
  }

  return [role];
};

const hasPermission = async (userId, requiredAction) => {
  const roles = await getUserRoles(userId);
  for (const role of roles) {
    if (role.permissions.some(p => p.action === requiredAction || p.action === '*')) {
      return true;
    }
  }
  return false;
};

module.exports = {
  getUserRoles,
  hasPermission,
};

