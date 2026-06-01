const { Queue, Worker } = require('bullmq');
const { getBullRedisClient } = require('../config/redis');
const aiService = require('../services/aiService');
const { getIO } = require('../socket');
const logger = require('../utils/logger');
const workerManager = require('../utils/workerManager');

let aiExtractionQueue;
let aiExtractionWorker;

const initAiExtractionQueue = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  aiExtractionQueue = new Queue('ai-extraction', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  });
  workerManager.registerQueue(aiExtractionQueue);
  logger.info('[QUEUE] AI Extraction Queue initialized.');
};

const initAiExtractionWorker = () => {
  const connection = getBullRedisClient();
  if (!connection) return;

  const FailedJob = require('../models/FailedJob');

  const { runWithJobContext } = require('../utils/context');

  aiExtractionWorker = new Worker(
    'ai-extraction',
    async (job) => {
      return runWithJobContext(job, async () => {
        const { text, userId, socketId } = job.data;
        try {
          logger.info(`[AI-WORKER] Processing extraction for job ${job.id}`);
          const suggestion = await aiService.extractTaskFromText(text);

          try {
            const { getEmitter, EVENTS } = require('../socket');
            getEmitter()
              .to(socketId || userId)
              .emit(EVENTS.AI_EXTRACTION_COMPLETE, {
                jobId: job.id,
                status: 'success',
                data: { suggestion },
              });
          } catch (socketErr) {
            logger.warn(
              `[AI-WORKER] Failed to notify client via socket: ${socketErr.message}`
            );
          }

          return suggestion;
        } catch (err) {
          logger.error(
            `[AI-WORKER] Extraction failed for job ${job.id}: ${err.message}`
          );

          try {
            const { getEmitter, EVENTS } = require('../socket');
            getEmitter()
              .to(socketId || userId)
              .emit(EVENTS.AI_EXTRACTION_COMPLETE, {
                jobId: job.id,
                status: 'error',
                message: err.message,
              });
          } catch (socketErr) {}

          throw err;
        }
      });
    },
    {
      connection,
      concurrency: parseInt(process.env.AI_WORKER_CONCURRENCY || '5'),
      lockDuration: 120000,
    }
  );

  workerManager.registerWorker(aiExtractionWorker);

  aiExtractionWorker.on('failed', async (job, err) => {
    const errMsg = err?.message || 'Unknown error';
    const errStack = err?.stack || '';
    if (job && job.attemptsMade >= 3) {
      try {
        const sanitizePayload = (data) => {
          try {
            const str = JSON.stringify(data);
            if (str.length > 50000) {
              return {
                _truncated: true,
                _originalSize: str.length,
                _sample: str.substring(0, 1000),
              };
            }
            return data;
          } catch (e) {
            return { _error: 'Failed to serialize payload' };
          }
        };

        await FailedJob.create({
          jobId: job.id,
          queueName: 'ai-extraction',
          payload: sanitizePayload(job.data),
          error: errMsg,
          stack: errStack,
          timestamp: new Date(),
        });
        logger.info(`[DLQ] AI Extraction Job ${job.id} moved to failed_jobs.`);
      } catch (dlqErr) {
        logger.error(
          `[DLQ] Failed to record AI job failure: ${dlqErr.message}`
        );
      }
    }
  });

  logger.info('[QUEUE] AI Extraction Worker operational.');
};

const getAiExtractionQueue = () => aiExtractionQueue;

module.exports = {
  initAiExtractionQueue,
  initAiExtractionWorker,
  getAiExtractionQueue,
};
