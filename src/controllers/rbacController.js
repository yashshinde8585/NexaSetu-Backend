const RbacEngine = require('../services/rbac/rbacEngine');
const Team = require('../models/Team');

exports.getRoles = async (req, res, next) => {
  try {
    const roles = await RbacEngine.getRoles();
    res.status(200).json({ status: 'success', data: { roles } });
  } catch (err) {
    next(err);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const { name, description, permissionIds } = req.body;
    const role = await RbacEngine.createRole(name, description, permissionIds);
    res.status(201).json({ status: 'success', data: { role } });
  } catch (err) {
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const role = await RbacEngine.updateRole(req.params.id, req.body);
    res.status(200).json({ status: 'success', data: { role } });
  } catch (err) {
    next(err);
  }
};

exports.getPermissions = async (req, res, next) => {
  try {
    const permissions = await RbacEngine.getPermissions();
    res.status(200).json({ status: 'success', data: { permissions } });
  } catch (err) {
    next(err);
  }
};

exports.getTeams = async (req, res, next) => {
  try {
    // Basic implementation for scope, in real scenario scoped to workspace
    const teams = await Team.find();
    res.status(200).json({ status: 'success', data: { teams } });
  } catch (err) {
    next(err);
  }
};
