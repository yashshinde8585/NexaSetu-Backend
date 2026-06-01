const mongoose = require('mongoose');
const logger = require('../utils/logger');

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Team must have a designated lead'],
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['Active', 'On Hold', 'Archived'],
      default: 'Active',
    },
    sprintsPerMonth: {
      type: Number,
      default: 2,
    },
  },
  {
    timestamps: true,
  }
);

// Index for workspace-specific team lookups
teamSchema.index({ workspaceId: 1, name: 1 });

teamSchema.pre(/^find/, async function () {
  const query = this.getQuery();
  if (
    query.workspaceId === undefined &&
    !this.getOptions().bypassTenantSafety
  ) {
    const msg = `[TENANT-SAFETY] Query executed without workspaceId filter on Team collection: ${JSON.stringify(query)}`;
    if (process.env.ENFORCE_TENANT_SAFETY === 'true') {
      throw new Error(msg);
    } else {
      logger.warn(msg);
    }
  }
});

module.exports = mongoose.model('Team', teamSchema);
