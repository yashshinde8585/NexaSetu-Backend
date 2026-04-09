const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'pro', 'enterprise'],
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'trialing', 'past_due', 'canceled'],
        default: 'trialing',
      },
      trialEndsAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      },
    },
    settings: {
      logo: String,
      allowedDomains: [String],
      timezone: { type: String, default: 'UTC+5:30' },
      workingHours: { type: String, default: '09:00 - 18:00' },
      notificationRules: { type: String, default: 'Email, Slack' },
      projectDefaults: { type: String, default: 'Sprint: 14 days' }
    },
    rolePermissions: {
      type: Map,
      of: [String],
      default: {}
    },
    integrations: {
      github: {
        connected: { type: Boolean, default: false },
        accessToken: String,
        githubId: String,
        repoCount: { type: Number, default: 0 },
        lastSync: Date
      },
      slack: {
        connected: { type: Boolean, default: false },
        channel: String,
        webhookUrl: String,
        lastSync: Date
      }
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Workspace', workspaceSchema);
