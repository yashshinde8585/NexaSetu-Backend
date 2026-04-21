const logger = require('./logger');

/**
 * Prevents "Ghost Operations" by monitoring client connection status.
 * Allows the system to abort expensive logic immediately if the requester disconnects.
 */
const monitorClientStatus = (req, cleanup) => {
  let isAborted = false;

  req.on('close', () => {
    isAborted = true;
    logger.warn(`[REQUEST-GUARD] Client disconnected prematurely: ${req.method} ${req.url}`);
    if (cleanup) cleanup();
  });

  return {
    get aborted() {
      return isAborted;
    },
    throwIfAborted: () => {
      if (isAborted) {
        const error = new Error('Client Disconnected');
        error.isClientDisconnected = true;
        throw error;
      }
    }
  };
};

module.exports = { monitorClientStatus };
