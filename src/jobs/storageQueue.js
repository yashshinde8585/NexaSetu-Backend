const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const supabase = require('../config/supabase');
const { STORAGE_CONSTANTS } = require('../utils/constants');
const logger = require('../utils/logger');
const workerManager = require('../utils/workerManager');

let storageQueue;
let storageWorker;

const initStorageQueue = async () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  storageQueue = new Queue('storage-cleanup', {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  try {
    await storageQueue.add(
      'cleanup-orphans',
      {},
      {
        repeat: { cron: '0 3 * * *' },
        jobId: 'daily-orphan-cleanup',
      }
    );
    logger.info('[QUEUE] Storage Cleanup Repeatable Job scheduled.');
  } catch (err) {
    logger.error(`[QUEUE] Failed to schedule repeatable job: ${err.message}`);
  }

  workerManager.registerQueue(storageQueue);
  logger.info('[QUEUE] Storage Queue initialized.');
};

const initStorageWorker = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  const FailedJob = require('../models/FailedJob');
  const { runWithJobContext } = require('../utils/context');

  storageWorker = new Worker(
    'storage-cleanup',
    async (job) => {
      return runWithJobContext(job, async () => {
        const { storagePaths } = job.data;

        if (job.name === 'cleanup-orphans') {
          logger.info('[WORKER] Starting daily orphaned storage audit...');
          const { runStorageCleanup } = require('../jobs/storageCleanupJob');
          await runStorageCleanup();
          return;
        }

        if (!storagePaths || storagePaths.length === 0) return;

        try {
          const { error } = await supabase.storage
            .from(STORAGE_CONSTANTS.BUCKET_NAME)
            .remove(storagePaths);

          if (error) throw error;
          logger.info(
            `[STORAGE-CLEANUP] Successfully deleted ${storagePaths.length} files.`
          );
        } catch (error) {
          logger.error(
            `[STORAGE-CLEANUP] Failed to delete files: ${error.message}`
          );
          throw error;
        }
      });
    },
    {
      connection,
      concurrency: parseInt(process.env.STORAGE_WORKER_CONCURRENCY || '10'),
    }
  );

  workerManager.registerWorker(storageWorker);

  storageWorker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= 5) {
      try {
        await FailedJob.create({
          jobId: job.id,
          queueName: 'storage-cleanup',
          payload: job.data,
          error: err.message,
          timestamp: new Date(),
        });
      } catch (dlqErr) {}
    }
  });

  logger.info('[QUEUE] Storage Worker operational.');
};

const getStorageQueue = () => storageQueue;

module.exports = { initStorageQueue, initStorageWorker, getStorageQueue };
