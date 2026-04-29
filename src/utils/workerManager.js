const logger = require('./logger');

const workers = [];
const queues = [];

const registerWorker = (worker) => {
  if (worker) {
    workers.push(worker);
    logger.debug(`[WORKER-MANAGER] Registered worker: ${worker.name}`);
  }
};

const registerQueue = (queue) => {
  if (queue) {
    queues.push(queue);
    logger.debug(`[WORKER-MANAGER] Registered queue: ${queue.name}`);
  }
};

const shutdown = async () => {
  logger.info('[WORKER-MANAGER] Initiating graceful shutdown of workers and queues...');
  
  const workerPromises = workers.map(async (worker) => {
    try {
      logger.info(`[WORKER-MANAGER] Closing worker: ${worker.name}`);
      await worker.close();
      logger.info(`[WORKER-MANAGER] Worker closed: ${worker.name}`);
    } catch (err) {
      logger.error(`[WORKER-MANAGER] Error closing worker ${worker.name}: ${err.message}`);
    }
  });

  await Promise.all(workerPromises);

  const queuePromises = queues.map(async (queue) => {
    try {
      logger.info(`[WORKER-MANAGER] Closing queue: ${queue.name}`);
      await queue.close();
      logger.info(`[WORKER-MANAGER] Queue closed: ${queue.name}`);
    } catch (err) {
      logger.error(`[WORKER-MANAGER] Error closing queue ${queue.name}: ${err.message}`);
    }
  });

  await Promise.all(queuePromises);
  logger.info('[WORKER-MANAGER] Graceful shutdown complete.');
};

module.exports = {
  registerWorker,
  registerQueue,
  shutdown
};
