const mongoose = require('mongoose');

const actionRequestSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['UPDATE_TASK_DEADLINE', 'REASSIGN_TASK', 'STATUS_CHANGE', 'PROJECT_TIMELINE_SHIFT', 'GITHUB_SYNC', 'DELETE_TASK']
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetType'
  },
  targetType: {
    type: String,
    required: true,
    enum: ['Task', 'Project', 'User']
  },
  payload: {
    type: Object,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  agent: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'executed', 'failed'],
    default: 'pending'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  executedAt: Date,
  oldValue: Object,
  newValue: Object
}, { timestamps: true });

module.exports = mongoose.model('ActionRequest', actionRequestSchema);
