const Workspace = require('../models/Workspace');
const AppError = require('../utils/appError');
const mongoose = require('mongoose');

class WorkspaceService {
  // Provision a new organization workspace with selected plan
  async provisionWorkspace(data, session = null) {
    const workspace = new Workspace({
      name: data.name,
      subscription: {
        plan: data.plan || 'free',
        status: 'active',
        features: this._getPlanFeatures(data.plan)
      },
      settings: {
        timezone: 'UTC +5:30',
        notifications: { email: true, slack: false }
      }
    });

    const options = session ? { session } : {};
    await workspace.save(options);
    return workspace;
  }

  // Set initial admin owner for the workspace
  async transferOwnership(workspaceId, newOwnerId, session = null) {
    const update = { admin: newOwnerId }; // Use 'admin' based on schema view
    const options = session ? { session, new: true } : { new: true };
    
    const workspace = await Workspace.findByIdAndUpdate(workspaceId, update, options);
    if (!workspace) throw new AppError('Workspace not found', 404);
    
    return workspace;
  }

  // Retrieve workspace details and subscription status
  async getWorkspaceDetails(workspaceId) {
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) throw new AppError('Workspace not found', 404);
    return workspace;
  }

  // Define feature flags and limits based on subscription plan
  _getPlanFeatures(plan) {
    const features = {
      free: { maxUsers: 5, maxProjects: 2, aiEnabled: false, customRoles: false },
      pro: { maxUsers: 25, maxProjects: 10, aiEnabled: true, customRoles: true },
      enterprise: { maxUsers: 1000, maxProjects: 1000, aiEnabled: true, customRoles: true }
    };
    return features[plan] || features.free;
  }

  // Update organizational settings and configurations
  async updateSettings(workspaceId, settings) {
    const workspace = await Workspace.findByIdAndUpdate(
      workspaceId,
      { $set: { settings } },
      { new: true, runValidators: true }
    );
    if (!workspace) throw new AppError('Workspace not found', 404);
    return workspace.settings;
  }

  // Modify subscription tier and update feature set
  async updateSubscription(workspaceId, plan) {
    const features = this._getPlanFeatures(plan);
    const workspace = await Workspace.findByIdAndUpdate(
      workspaceId,
      { 
        $set: { 
          'subscription.plan': plan,
          'subscription.features': features
        } 
      },
      { new: true }
    );
    return workspace.subscription;
  }
}

module.exports = new WorkspaceService();
