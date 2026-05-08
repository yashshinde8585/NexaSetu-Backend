const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    githubAccessToken: {
      type: String,
      get: decrypt,
      set: encrypt,
    },
    role: {
      type: String,
      default: 'PROJECT_MEMBER',
      index: true,
    },
    jobTitle: {
      type: String,
      default: 'Software Engineer',
    },
    assignedProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      index: true,
    },
    hasSeenTour: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,
    status: {
      type: String,
      enum: ['Active', 'Deactivated', 'Invited'],
      default: 'Active',
      index: true,
    },
    clerkUserId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    profilePicture: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ workspaceId: 1, role: 1 });
userSchema.index({ workspaceId: 1, email: 1 });
userSchema.index({ workspaceId: 1, githubId: 1 }, { sparse: true });

userSchema.pre(/^find/, async function () {
  const query = this.getQuery();
  const isGlobalLookup = query.email !== undefined || query._id !== undefined || this.getOptions().bypassTenantSafety;
  
  if (query.workspaceId === undefined && !isGlobalLookup) {
    logger.warn(`[TENANT-SAFETY] Query executed without workspaceId filter on User collection: %o`, query);
  }
});

module.exports = mongoose.model('User', userSchema);
