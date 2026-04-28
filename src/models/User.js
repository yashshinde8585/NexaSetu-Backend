const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    profilePicture: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ESR Optimization: workspaceId (Equality) -> role/email (Sort/Equality)
userSchema.index({ workspaceId: 1, role: 1 });
userSchema.index({ workspaceId: 1, email: 1 });
userSchema.index({ workspaceId: 1, githubId: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
