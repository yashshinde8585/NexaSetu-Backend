const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    performer: {
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
    entityType: {
      type: String,
      required: true,
      enum: ['PROJECT', 'TASK', 'USER', 'INVITATION', 'AI_ACTION', 'TEAM', 'ROLE'],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    ip: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

auditLogSchema.index({ timestamp: 1 }, { expiresAfterSeconds: 7776000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
