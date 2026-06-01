const mongoose = require('mongoose');
const logger = require('../utils/logger');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      unique: true,
      trim: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['healthy', 'degraded', 'failing', 'maintenance'],
      default: 'healthy',
    },
    latency: {
      type: Number, // in ms
      default: 0,
    },
    errorRate: {
      type: Number, // percentage
      default: 0,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      },
    ],
    technicalDebt: {
      score: { type: Number, default: 0 }, // 0-100
      notes: String,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for workspace-specific status queries
serviceSchema.index({ workspaceId: 1, status: 1 });

serviceSchema.pre(/^find/, async function () {
  const query = this.getQuery();
  if (
    query.workspaceId === undefined &&
    !this.getOptions().bypassTenantSafety
  ) {
    const msg = `[TENANT-SAFETY] Query executed without workspaceId filter on Service collection: ${JSON.stringify(query)}`;
    if (process.env.ENFORCE_TENANT_SAFETY === 'true') {
      throw new Error(msg);
    } else {
      logger.warn(msg);
    }
  }
});

module.exports = mongoose.model('Service', serviceSchema);
