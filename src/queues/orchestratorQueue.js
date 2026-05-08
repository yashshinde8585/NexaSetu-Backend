const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const workerManager = require('../utils/workerManager');

let orchestratorQueue;
let orchestratorWorker;

const initOrchestratorQueue = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  orchestratorQueue = new Queue('agent-orchestrator', {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  workerManager.registerQueue(orchestratorQueue);
  logger.info('[QUEUE] Orchestrator Queue initialized.');
};

const initOrchestratorWorker = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  const agentOrchestrator = require('../services/agentOrchestrator');
  const FailedJob = require('../models/FailedJob');

const { runWithJobContext } = require('../utils/context');

  orchestratorWorker = new Worker(
    'agent-orchestrator',
    async (job) => {
      return runWithJobContext(job, async () => {
        const { event } = job.data;
        try {
          logger.info(`[WORKER] Starting job ${job.id} | Event: ${event.type}`);
          await agentOrchestrator.processEvent(event);
          logger.info(`[WORKER] Completed job ${job.id}`);
        } catch (err) {
          logger.error(`[WORKER] Critical failure in job ${job.id}: ${err.message}`);
          throw err;
        }
      });
    },
    { 
      connection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10'),
      limiter: {
        max: 100,
        duration: 5000
      }
    }
  );

  workerManager.registerWorker(orchestratorWorker);

  orchestratorWorker.on('failed', async (job, err) => {
    logger.error(`[QUEUE] Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`);
    
    if (job && job.attemptsMade >= 5) {
      try {
        await FailedJob.create({
          jobId: job.id,
          queueName: 'agent-orchestrator',
          payload: job.data,
          error: err.message,
          stack: err.stack,
          timestamp: new Date()
        });
        const { notify } = require('../utils/notify');
        await notify('ERROR', `Job ${job.id} moved to DLQ`, { queue: 'agent-orchestrator', error: err.message });
        logger.info(`[DLQ] Job ${job.id} moved to failed_jobs collection.`);
      } catch (dlqErr) {
        logger.error(`[DLQ] Failed to record job failure: ${dlqErr.message}`);
      }
    }
  });

  orchestratorWorker.on('completed', (job) => {
    logger.debug(`[QUEUE] Job ${job.id} completed successfully.`);
  });

  logger.info('[QUEUE] Orchestrator Worker operational.');
};

const getOrchestratorQueue = () => orchestratorQueue;

module.exports = { initOrchestratorQueue, initOrchestratorWorker, getOrchestratorQueue };

