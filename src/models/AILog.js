const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: ['TASK_CREATED', 'TASK_UPDATED', 'TASK_DELAYED', 'USER_OVERLOADED', 'GITHUB_ACTIVITY']
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  entityId: mongoose.Schema.Types.ObjectId, // Task ID, User ID, etc.
  entityType: {
    type: String,
    enum: ['task', 'user', 'project']
  },
  agent: {
    type: String,
    required: true,
    enum: ['Orchestrator', 'Harvester', 'Scheduler', 'Portfolio', 'Resource']
  },
  decision: {
    type: String,
    required: true
  },
  actionTaken: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AILog', aiLogSchema);
