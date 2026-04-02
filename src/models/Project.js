const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  githubRepo: {
    owner: String,
    repo: String,
    fullName: String,
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
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
}, {
  timestamps: true,
});

// Auto-generate project key if not provided
projectSchema.pre('save', function () {
  if (!this.key && this.name) {
    // Take first 3-4 letters of name, remove spaces, uppercase
    this.key = this.name
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 3)
      .toUpperCase();
    
    // If name is too short, pad with X
    while (this.key.length < 3) {
      this.key += 'X';
    }
  }
});

module.exports = mongoose.model('Project', projectSchema);
