const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const workerManager = require('../utils/workerManager');

let magicBarQueue;
let magicBarWorker;

const initMagicBarQueue = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  magicBarQueue = new Queue('magic-bar', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 }
    }
  });
  workerManager.registerQueue(magicBarQueue);
  logger.info('[QUEUE] Magic Bar Queue initialized.');
};

const initMagicBarWorker = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  const magicBarService = require('../services/magicBarService');

const { runWithJobContext } = require('../utils/context');

  magicBarWorker = new Worker(
    'magic-bar',
    async (job) => {
      return runWithJobContext(job, async () => {
        const { user, actions, frontendContext, jobId } = job.data;
      try {
        logger.info(`[MAGIC-WORKER] Processing background command for job ${job.id}`);
        
        const result = await magicBarService.executeInterpretedActions(user, actions, frontendContext);
        
        const { getEmitter, EVENTS } = require('../socket');
        getEmitter().to(user._id.toString()).emit(EVENTS.MAGICBAR_COMPLETE || 'MAGICBAR_COMPLETE', {
          jobId: jobId || job.id,
          status: 'success',
          actions: result.actions,
          actionTriggered: result.actionTriggered
        });

        return result;
      } catch (err) {
        logger.error(`[MAGIC-WORKER] Command execution failed for job ${job.id}: ${err.message}`);
        
        const { getEmitter, EVENTS } = require('../socket');
        getEmitter().to(user._id.toString()).emit(EVENTS.MAGICBAR_COMPLETE || 'MAGICBAR_COMPLETE', {
          jobId: jobId || job.id,
          status: 'error',
          message: err.message
        });
        
        throw err;
      }
    });
  },
    { 
      connection, 
      concurrency: 5 
    }
  );

  workerManager.registerWorker(magicBarWorker);

  logger.info('[QUEUE] Magic Bar Worker operational.');
};

const getMagicBarQueue = () => magicBarQueue;

module.exports = { initMagicBarQueue, initMagicBarWorker, getMagicBarQueue };
