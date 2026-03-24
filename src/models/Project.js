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
}, {
  timestamps: true,
});

module.exports = mongoose.model('Project', projectSchema);
