const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_DELAYED',
        'USER_OVERLOADED',
        'GITHUB_ACTIVITY',
      ],
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['task', 'user', 'project'],
    },
    agent: {
      type: String,
      required: true,
      enum: ['Orchestrator', 'Harvester', 'Scheduler', 'Portfolio', 'Resource'],
      index: true,
    },
    decision: {
      type: String,
      required: true,
    },
    actionTaken: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

aiLogSchema.index({ eventType: 1, entityId: 1, timestamp: -1 });
aiLogSchema.index({ workspaceId: 1, eventType: 1, timestamp: -1 });
aiLogSchema.index({ workspaceId: 1, project: 1, timestamp: -1 });
aiLogSchema.index({ timestamp: 1 }, { expiresAfterSeconds: 2592000 });

module.exports = mongoose.model('AILog', aiLogSchema);
