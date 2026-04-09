const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    role: {
      type: String,
      default: 'PROJECT_MEMBER',
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Invitation', invitationSchema);
