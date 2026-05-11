const mongoose = require('mongoose');

const directiveSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['FOCUS', 'STABILIZE', 'PIVOT', 'REBALANCE'],
    },
    priority: {
      type: Number,
      default: 5, // 1-10
      min: 1,
      max: 10,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    scope: {
      type: {
        type: String,
        enum: ['WORKSPACE', 'PROJECT', 'TEAM'],
        default: 'WORKSPACE',
      },
      targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
      },
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['issued', 'acknowledged', 'completed', 'cancelled'],
      default: 'issued',
    },
    acknowledgments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

directiveSchema.index({ workspaceId: 1, status: 1 });
directiveSchema.index({ 'scope.type': 1, 'scope.targetId': 1 });

module.exports = mongoose.model('Directive', directiveSchema);
