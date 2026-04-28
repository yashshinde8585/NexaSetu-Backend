const AppError = require('../utils/appError');
const logger = require('../utils/logger');

const timeoutHandler = (timeoutMs = 15000) => {
  return (req, res, next) => {
    req.setTimeout(timeoutMs, () => {
      logger.error(`[TIMEOUT] Request to ${req.method} ${req.originalUrl} timed out after ${timeoutMs}ms`);
      const err = new AppError('Gateway Timeout: The request took too long to process', 504);
      err.code = 'GATEWAY_TIMEOUT';
      next(err);
    });

    next();
  };
};

module.exports = timeoutHandler;
