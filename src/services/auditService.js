const AuditLog = require('../models/AuditLog');

// Asynchronously persists detailed user and system actions into a traceable ledger.
class AuditService {
  async log({ action, req, entityType, entityId, details }) {
    try {
      const entry = {
        action,
        perfomer: req.user._id,
        workspaceId: req.user.workspaceId,
        entityType,
        entityId,
        details,
        ip:
          req.ip ||
          req.headers['x-forwarded-for'] ||
          req.connection.remoteAddress,
      };

      const log = await AuditLog.create(entry);

      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[AUDIT]: ${action} by ${req.user.email} on ${entityType} ${entityId || ''}`
        );
      }

      return log;
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }
}

module.exports = new AuditService();
