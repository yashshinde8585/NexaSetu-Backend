const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const workerManager = require('../utils/workerManager');

let cronQueue;
let cronWorker;

const initCronQueue = async () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  cronQueue = new Queue('system-cron', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 }
    }
  });

  try {
    await cronQueue.add('morning-diagnostic', {}, {
      repeat: { cron: '0 8 * * *' },
      jobId: 'daily-morning-diagnostic'
    });
    logger.info('[QUEUE] Cron Repeatable Jobs scheduled.');
  } catch (err) {
    logger.error(`[QUEUE] Failed to schedule cron jobs: ${err.message}`);
  }

  workerManager.registerQueue(cronQueue);
  logger.info('[QUEUE] Cron Queue initialized.');
};

const initCronWorker = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  const cronService = require('../services/cronService');

  cronWorker = new Worker(
    'system-cron',
    async (job) => {
      logger.info(`[CRON-WORKER] Executing scheduled job: ${job.name}`);
      
      if (job.name === 'morning-diagnostic') {
        await cronService.runMorningDiagnostic();
      }
      
      logger.info(`[CRON-WORKER] Job completed: ${job.name}`);
    },
    { 
      connection,
      concurrency: 1 
    }
  );

  workerManager.registerWorker(cronWorker);
  logger.info('[QUEUE] Cron Worker operational.');
};

const getCronQueue = () => cronQueue;

module.exports = { initCronQueue, initCronWorker, getCronQueue };
