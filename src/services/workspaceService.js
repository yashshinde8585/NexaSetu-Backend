const Workspace = require('../models/Workspace');
const AppError = require('../utils/appError');
const mongoose = require('mongoose');

const getPlanFeatures = (plan) => {
  const features = {
    free: { maxUsers: 5, maxProjects: 2, aiEnabled: false, customRoles: false },
    pro: { maxUsers: 25, maxProjects: 10, aiEnabled: true, customRoles: true },
    enterprise: {
      maxUsers: 1000,
      maxProjects: 1000,
      aiEnabled: true,
      customRoles: true,
    },
  };
  return features[plan] || features.free;
};

const provisionWorkspace = async (data, session = null) => {
  const workspace = new Workspace({
    name: data.name,
    adminName: data.adminName,
    subscription: {
      plan: data.plan || 'free',
      status: 'active',
      features: getPlanFeatures(data.plan),
    },
    settings: {
      timezone: 'UTC +5:30',
      notifications: { email: true, slack: false },
    },
  });

  const options = session ? { session } : {};
  await workspace.save(options);
  return workspace;
};

const transferOwnership = async (workspaceId, newOwnerId, session = null) => {
  const update = { admin: newOwnerId };
  const options = session ? { session, new: true } : { new: true };

  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    update,
    options
  );
  if (!workspace) throw new AppError('Workspace not found', 404);

  return workspace;
};

const getWorkspaceDetails = async (workspaceId) => {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw new AppError('Workspace not found', 404);
  return workspace;
};

const updateSettings = async (workspaceId, settings) => {
  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $set: { settings } },
    { new: true, runValidators: true }
  );
  if (!workspace) throw new AppError('Workspace not found', 404);
  return workspace.settings;
};

const updateSubscription = async (workspaceId, plan) => {
  const features = getPlanFeatures(plan);
  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    {
      $set: {
        'subscription.plan': plan,
        'subscription.features': features,
      },
    },
    { new: true }
  );
  return workspace.subscription;
};

module.exports = {
  provisionWorkspace,
  transferOwnership,
  getWorkspaceDetails,
  updateSettings,
  updateSubscription,
};
