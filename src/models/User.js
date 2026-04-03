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
      enum: [
        'WORKSPACE_ADMIN',
        'WORKSPACE_MANAGER',
        'TECH_LEAD',
        'SENIOR_ENGINEER',
        'SOFTWARE_ENGINEER',
        'PROJECT_MEMBER',
        'INTERN',
        'RESTRICTED',
      ],
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

module.exports = mongoose.model('User', userSchema);
