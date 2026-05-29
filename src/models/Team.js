const mongoose = require('mongoose');

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

module.exports = mongoose.model('Team', teamSchema);
