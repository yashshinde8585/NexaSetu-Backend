const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const log = async ({ action, user, workspaceId, entityType, entityId, details, req }) => {
  try {
    const entry = {
      action,
      performer: user?._id || req?.user?._id,
      workspaceId: workspaceId || req?.user?.workspaceId,
      entityType,
      entityId,
      details,
      ip: req ? (req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress) : 'system',
      timestamp: new Date()
    };

    await AuditLog.create(entry);
    
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[AUDIT]: ${action} on ${entityType}:${entityId}`);
    }
  } catch (err) {
    logger.error(`[AUDIT ERROR] Failed to write log: ${err.message}`);
  }
};

const logUpdate = async (user, entityType, entityId, before, after, req) => {
  const diff = {};
  Object.keys(after).forEach(key => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = {
        old: before[key],
        new: after[key]
      };
    }
  });

  if (Object.keys(diff).length === 0) return;

  return log({
    action: `UPDATE_${entityType}`,
    user,
    entityType,
    entityId,
    details: { diff },
    req
  });
};

module.exports = {
  log,
  logUpdate,
};
