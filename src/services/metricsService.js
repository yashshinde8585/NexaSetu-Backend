const mongoose = require('mongoose');
const logger = require('../utils/logger');

const eventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    index: true,
  },
  eventType: {
    type: String,
    required: true,
    index: true,
  },
  payload: mongoose.Schema.Types.Mixed,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  metadata: {
    ip: String,
    userAgent: String,
  },
});

const Event = mongoose.model('Event', eventSchema);

const trackEvent = async (user, eventType, payload = {}, meta = {}) => {
  try {
    await Event.create({
      userId: user?._id,
      workspaceId: user?.workspaceId,
      eventType,
      payload,
      metadata: {
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    logger.info(
      `[METRICS] Event tracked: ${eventType} for user ${user?._id || 'ANONYMOUS'}`
    );
  } catch (err) {
    logger.error(`[METRICS] Tracking failed: ${err.message}`);
  }
};

const getDashboardMetrics = async (workspaceId) => {
  return {
    activeUsers: 0,
    totalTasks: 0,
  };
};

module.exports = {
  trackEvent,
  getDashboardMetrics,
};
