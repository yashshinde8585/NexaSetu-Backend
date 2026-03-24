const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'done'],
    default: 'todo',
  },
  assignedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  source: {
    type: String,
    enum: ['manual', 'ai-generated', 'github'],
    default: 'manual',
  },
  isAiGenerated: {
    type: Boolean,
    default: false,
  },
  githubId: {
    type: String,
    sparse: true,
  },
}, {
  timestamps: true,
});

// Compound unique index: Same activity can be a task in DIFFERENT projects, but not twice in the SAME project
taskSchema.index({ githubId: 1, project: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Task', taskSchema);
