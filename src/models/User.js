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
    department: {
      type: String,
      enum: [
        'Engineering',
        'Product',
        'QA & Testing',
        'Design',
        'Sales',
        'Marketing',
        'HR',
        'Finance',
      ],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

userSchema.pre('save', function () {
  if (this.isModified('jobTitle') || !this.department) {
    const title = (this.jobTitle || '').toLowerCase();
    const role = (this.role || '').toLowerCase();

    if (
      title.includes('engineer') ||
      title.includes('developer') ||
      role.includes('engineer') ||
      role.includes('swe')
    ) {
      if (
        title.includes('qa') ||
        title.includes('test') ||
        role.includes('qa')
      ) {
        this.department = 'QA & Testing';
      } else {
        this.department = 'Engineering';
      }
    } else if (title.includes('product') || role.includes('product')) {
      this.department = 'Product';
    } else if (
      title.includes('design') ||
      title.includes('ux') ||
      title.includes('ui')
    ) {
      this.department = 'Design';
    } else if (title.includes('sales')) {
      this.department = 'Sales';
    } else if (title.includes('marketing')) {
      this.department = 'Marketing';
    } else if (
      title.includes('hr') ||
      title.includes('recru') ||
      role.includes('hr')
    ) {
      this.department = 'HR';
    } else if (title.includes('finance') || title.includes('billing')) {
      this.department = 'Finance';
    } else {
      this.department = 'Engineering';
    }
  }
});

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
  const isGlobalLookup =
    query.email !== undefined ||
    query._id !== undefined ||
    query.clerkUserId !== undefined ||
    this.getOptions().bypassTenantSafety;

  if (query.workspaceId === undefined && !isGlobalLookup) {
    const { getContext } = require('../utils/context');
    const store = getContext();
    const requestId = store.requestId || 'unknown';
    const actor = store.user
      ? `User(id=${store.user.id}, role=${store.user.role})`
      : 'System/Anonymous';

    const msg = `[TENANT-SAFETY] Query executed without workspaceId filter on User collection: ${JSON.stringify(query)} | Actor: ${actor} | RequestId: ${requestId}`;

    if (process.env.ENFORCE_TENANT_SAFETY === 'true') {
      throw new Error(msg);
    } else {
      logger.warn(msg);
    }
  }
});

module.exports = mongoose.model('User', userSchema);
