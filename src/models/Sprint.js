const mongoose = require('mongoose');

const sprintSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Sprint name is required'],
      trim: true,
      index: true,
    },
    goal: {
      type: String,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'upcoming', 'archived'],
      default: 'upcoming',
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: false,
      index: true,
    },
    capacityPredicted: {
      type: Number,
      default: 0,
    },
    pointsTarget: {
      type: Number,
      default: 0,
    },
    healthScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    pressureIndex: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    metricsSnapshot: [
      {
        timestamp: { type: Date, default: Date.now },
        burnRate: Number,
        completionPercentage: Number,
        activeBlockers: Number,
        pressure: Number,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Operational cycles must be scoped to a workspace'],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ESR Optimization: workspaceId (Equality) -> project (Equality) -> status (Sort/Equality)
sprintSchema.index({ workspaceId: 1, project: 1, status: 1 });
sprintSchema.index({ workspaceId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Sprint', sprintSchema);
