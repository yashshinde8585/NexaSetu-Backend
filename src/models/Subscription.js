const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'trial', 'canceled', 'expired'],
      default: 'active',
      required: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    isTrial: {
      type: Boolean,
      default: false,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    // Usage tracking for current billing period
    usage: {
      aiUsage: { type: Number, default: 0 },
      projects: { type: Number, default: 0 },
    },
    lastResetAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup within a workspace context
subscriptionSchema.index({ workspaceId: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
