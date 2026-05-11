const logger = require('./logger');

const createCircuitBreaker = function(serviceName, options = {}) {
  const failureThreshold = options.failureThreshold || 5;
  const resetTimeout = options.resetTimeout || 30000;
  
  let state = 'CLOSED'; 
  let failureCount = 0;
  let nextAttempt = Date.now();

  const onSuccess = () => {
    failureCount = 0;
    state = 'CLOSED';
  };

  const onFailure = (error) => {
    failureCount++;
    logger.warn(`[CIRCUIT-BREAKER] ${serviceName} failure detected (${failureCount}/${failureThreshold}): ${error.message}`);
    
    if (failureCount >= failureThreshold || state === 'HALF_OPEN') {
      state = 'OPEN';
      nextAttempt = Date.now() + resetTimeout;
      logger.error(`[CIRCUIT-BREAKER] ${serviceName} circuit OPENED. Tripping for ${resetTimeout}ms.`);
    }
  };

  const execute = async (action, fallback = null) => {
    if (state === 'OPEN') {
      if (Date.now() > nextAttempt) {
        state = 'HALF_OPEN';
        logger.info(`[CIRCUIT-BREAKER] ${serviceName} entering HALF_OPEN state. Testing connectivity...`);
      } else {
        if (fallback) return fallback();
        throw new Error(`Circuit Breaker for ${serviceName} is OPEN. Failing fast.`);
      }
    }

    try {
      const result = await action();
      onSuccess();
      return result;
    } catch (error) {
      onFailure(error);
      if (fallback) return fallback();
      throw error;
    }
  };

  return {
    execute,
    get state() { return state; },
    get failureCount() { return failureCount; }
  };
};

module.exports = createCircuitBreaker;
