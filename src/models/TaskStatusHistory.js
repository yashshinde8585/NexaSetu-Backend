const mongoose = require('mongoose');

const taskStatusHistorySchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.ObjectId,
    ref: 'Task',
    required: true,
  },
  fromStatus: {
    type: String,
    required: true,
  },
  toStatus: {
    type: String,
    required: true,
  },
  changedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false,
});

// Index for quick velocity calculations by date
taskStatusHistorySchema.index({ timestamp: -1 });
taskStatusHistorySchema.index({ task: 1, timestamp: -1 });

const TaskStatusHistory = mongoose.model('TaskStatusHistory', taskStatusHistorySchema);

module.exports = TaskStatusHistory;
