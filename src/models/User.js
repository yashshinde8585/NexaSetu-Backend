const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubAccessToken: {
      type: String,
    },
    role: {
      type: String,
      default: 'PROJECT_MEMBER',
    },
    jobTitle: {
      type: String,
      default: 'Software Engineer',
    },
    assignedProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    hasSeenTour: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Strategic indexing for workspace isolation and role-based searching
userSchema.index({ workspaceId: 1, role: 1 });
userSchema.index({ workspaceId: 1, email: 1 });

module.exports = mongoose.model('User', userSchema);
