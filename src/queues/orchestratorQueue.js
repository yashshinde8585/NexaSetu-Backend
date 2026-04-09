const { Queue, Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

let orchestratorQueue;
let orchestratorWorker;

/**
 * Initializes the background event queue.
 * Moves long-running tasks out of the main request thread.
 */
const initOrchestratorQueue = () => {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('[QUEUE] Redis not available, background orchestration disabled.');
    return;
  }

  orchestratorQueue = new Queue('agent-orchestrator', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });

  // Re-import to avoid circular dependencies
  const agentOrchestrator = require('../services/agentOrchestrator');

  orchestratorWorker = new Worker(
    'agent-orchestrator',
    async (job) => {
      const { event } = job.data;
      logger.info(`[QUEUE-WORKER] Processing event: ${event.type} for entity: ${event.entityId}`);
      await agentOrchestrator.processEvent(event);
    },
    { 
      connection: redis,
      concurrency: 5 // Process up to 5 events in parallel
    }
  );

  orchestratorWorker.on('failed', (job, err) => {
    logger.error(`[QUEUE-WORKER] Job ${job.id} failed: ${err.message}`);
  });

  logger.info('[QUEUE] Agent Orchestrator queue and worker initialized.');
};

const getOrchestratorQueue = () => orchestratorQueue;

module.exports = { initOrchestratorQueue, getOrchestratorQueue };
