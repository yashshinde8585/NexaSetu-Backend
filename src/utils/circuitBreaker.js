const logger = require('./logger');

/**
 * Isolates unstable external dependencies (AI, GitHub) to prevent cascading failures.
 * Protects system thread-pools by failing fast when remote services are non-responsive.
 */
class CircuitBreaker {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    
    this.state = 'CLOSED'; 
    this.failureCount = 0;
    this.nextAttempt = Date.now();
  }

  async execute(action, fallback = null) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        // Transition to HALF_OPEN to test if the remote service has recovered
        this.state = 'HALF_OPEN';
        logger.info(`[CIRCUIT-BREAKER] ${this.serviceName} entering HALF_OPEN state. Testing connectivity...`);
      } else {
        if (fallback) return fallback();
        throw new Error(`Circuit Breaker for ${this.serviceName} is OPEN. Failing fast.`);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      if (fallback) return fallback();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure(error) {
    this.failureCount++;
    logger.warn(`[CIRCUIT-BREAKER] ${this.serviceName} failure detected (${this.failureCount}/${this.failureThreshold}): ${error.message}`);
    
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      // Trip the circuit immediately on threshold breach or if a probe fails during HALF_OPEN
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      logger.error(`[CIRCUIT-BREAKER] ${this.serviceName} circuit OPENED. Tripping for ${this.resetTimeout}ms.`);
    }
  }
}

module.exports = CircuitBreaker;
