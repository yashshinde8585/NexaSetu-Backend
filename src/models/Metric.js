const mongoose = require('mongoose');

const metricSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'velocity', 'completion_rate', 'health'
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Metric', metricSchema);
