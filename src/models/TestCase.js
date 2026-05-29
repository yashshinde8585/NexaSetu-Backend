const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Test case title is required'],
      trim: true,
    },
    module: {
      type: String,
      required: [true, 'Module name is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['passed', 'failed', 'blocked', 'pending'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    blockedBy: {
      type: String, // e.g., "API Unavailable", "Database Issue"
    },
    steps: [
      {
        text: String,
        isPassed: { type: Boolean, default: false },
      },
    ],
    lastRunAt: {
      type: Date,
    },
    runBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    buildVersion: {
      type: String,
    },
    isRegression: {
      type: Boolean,
      default: false,
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
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('TestCase', testCaseSchema);
