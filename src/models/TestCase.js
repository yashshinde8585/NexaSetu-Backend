const mongoose = require('mongoose');
const logger = require('../utils/logger');

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

testCaseSchema.pre(/^find/, async function () {
  const query = this.getQuery();
  if (
    query.workspaceId === undefined &&
    !this.getOptions().bypassTenantSafety
  ) {
    const msg = `[TENANT-SAFETY] Query executed without workspaceId filter on TestCase collection: ${JSON.stringify(query)}`;
    if (process.env.ENFORCE_TENANT_SAFETY === 'true') {
      throw new Error(msg);
    } else {
      logger.warn(msg);
    }
  }
});

module.exports = mongoose.model('TestCase', testCaseSchema);
