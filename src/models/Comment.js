const mongoose = require('mongoose');

// Schema for task-level discussion and mission-critical activity logging.
const commentSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: [true, 'Comment must belong to a task'],
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment must have an author'],
  },
  content: {
    type: String,
    required: [true, 'Comment content cannot be empty'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['user_comment', 'system_log'],
    default: 'user_comment',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Performance optimization for chronological feed retrieval.
commentSchema.index({ task: 1, createdAt: 1 });

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
