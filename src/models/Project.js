const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true, // Multikey index for member-based lookup
      },
    ],
    githubRepo: {
      owner: String,
      repo: String,
      fullName: { type: String, index: true, sparse: true },
    },
    sprint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
    },
    lastTaskNumber: {
      type: Number,
      default: 0,
    },
    key: {
      type: String,
      uppercase: true,
      trim: true,
      required: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.pre('save', function () {
  if (!this.key && this.name) {
    this.key = this.name
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 3)
      .toUpperCase();

    while (this.key.length < 3) {
      this.key += 'X';
    }
  }
});

// Strategic Compound Indexes
projectSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
projectSchema.index({ workspaceId: 1, name: 1 });
projectSchema.index({ workspaceId: 1, members: 1 });

module.exports = mongoose.model('Project', projectSchema);
