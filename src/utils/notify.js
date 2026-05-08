const axios = require('axios');
const logger = require('./logger');
const { getRequestId } = require('./context');

const notify = async (level, message, metadata = {}) => {
  const requestId = getRequestId();
  const alertData = {
    service: 'nexasetu-backend',
    level,
    message,
    requestId,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  const logMethod = level === 'CRITICAL' ? 'error' : level.toLowerCase();
  logger[logMethod](`[ALERT] ${message}`, alertData);

  if (process.env.NODE_ENV === 'production' && process.env.ALERT_WEBHOOK_URL) {
    try {
      axios.post(process.env.ALERT_WEBHOOK_URL, alertData).catch(() => {});
    } catch (err) {
      logger.warn(`[NOTIFY] External alert dispatch failed: ${err.message}`);
    }
  }
};

module.exports = { notify };
