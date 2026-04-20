const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

let orchestratorQueue;
let orchestratorWorker;

// Initializes the background orchestration queue and worker
const initOrchestratorQueue = () => {
  const connection = getBullRedisClient();
  
  if (!connection) {
    logger.error('[QUEUE] Redis connection failed. Background jobs are offline.');
    return;
  }

  // Define the main orchestration queue with robust retry policies
  orchestratorQueue = new Queue('agent-orchestrator', {
    connection,
    defaultJobOptions: {
      attempts: 5, // Increased attempts for higher reliability
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 }, // Keep history of last 100 successful jobs
      removeOnFail: { count: 500 }, // Keep history of last 500 failed jobs for audit
    },
  });

  // Worker implementation for processing background tasks
  const agentOrchestrator = require('../services/agentOrchestrator');

  orchestratorWorker = new Worker(
    'agent-orchestrator',
    async (job) => {
      const { event } = job.data;
      try {
        await agentOrchestrator.processEvent(event);
      } catch (err) {
        logger.error(`[WORKER] Critical failure in job ${job.id}: ${err.message}`);
        throw err; // Re-throw to trigger BullMQ retry logic
      }
    },
    { 
      connection,
      concurrency: 10, // Scaled up concurrency for higher throughput
      limiter: {
        max: 100, // Process max 100 jobs per 5 seconds
        duration: 5000
      }
    }
  );

  // Global worker event listeners
  orchestratorWorker.on('failed', (job, err) => {
    logger.error(`[QUEUE] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`);
  });

  orchestratorWorker.on('completed', (job) => {
    logger.debug(`[QUEUE] Job ${job.id} completed successfully.`);
  });

  logger.info('[QUEUE] Background Orchestration Service operational.');
};

const getOrchestratorQueue = () => orchestratorQueue;

module.exports = { initOrchestratorQueue, getOrchestratorQueue };
