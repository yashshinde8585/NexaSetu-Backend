const mongoose = require('mongoose');

const failedJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
  },
  queueName: {
    type: String,
    required: true,
    index: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
  },
  error: {
    type: String,
  },
  stack: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },

});

failedJobSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

const FailedJob = mongoose.model('FailedJob', failedJobSchema);

module.exports = FailedJob;
