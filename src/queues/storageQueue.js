const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const supabase = require('../config/supabase');
const { STORAGE_CONSTANTS } = require('../utils/constants');
const logger = require('../utils/logger');

const storageQueue = new Queue('storage-cleanup', {
  connection: getBullRedisClient(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s, 40s, 80s
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep for DLQ analysis
  },
});

// Worker to process storage deletions
const storageWorker = new Worker(
  'storage-cleanup',
  async (job) => {
    const { storagePaths } = job.data;

    if (!storagePaths || storagePaths.length === 0) return;

    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_CONSTANTS.BUCKET_NAME)
        .remove(storagePaths);

      if (error) throw error;

      logger.info(`[STORAGE-CLEANUP] Successfully deleted ${storagePaths.length} files from storage.`);
    } catch (error) {
      logger.error(`[STORAGE-CLEANUP] Failed to delete files: ${error.message}`);
      throw error;
    }
  },
  { connection: getBullRedisClient() }
);

module.exports = storageQueue;
