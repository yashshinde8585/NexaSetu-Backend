const AppError = require('../utils/appError');
const logger = require('../utils/logger');

const redactHeaders = (headers) => {
  const redacted = { ...headers };
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'session',
    'jwt',
    'x-csrf-token',
  ];
  sensitiveHeaders.forEach((header) => {
    if (redacted[header]) {
      redacted[header] = '[REDACTED]';
    }
  });
  return redacted;
};

const timeoutHandler = (timeoutMs = 15000) => {
  return (req, res, next) => {
    req.setTimeout(timeoutMs, () => {
      const redactedHeaders = redactHeaders(req.headers);
      const userContext = req.user
        ? { id: req.user._id, role: req.user.role }
        : 'anonymous';
      const requestId = req.id || req.headers['x-request-id'] || 'unknown';

      logger.error(
        `[TIMEOUT] Request timed out. URL: ${req.method} ${req.originalUrl} | Time: ${timeoutMs}ms | RequestId: ${requestId} | User: ${JSON.stringify(userContext)} | Query: ${JSON.stringify(req.query)} | Headers: ${JSON.stringify(redactedHeaders)}`
      );
      const err = new AppError(
        'Gateway Timeout: The request took too long to process',
        504
      );
      err.code = 'GATEWAY_TIMEOUT';
      next(err);
    });

    next();
  };
};

module.exports = timeoutHandler;
