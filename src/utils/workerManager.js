const logger = require('./logger');

const workers = [];
const queues = [];

const registerWorker = (worker) => {
  if (worker) {
    workers.push(worker);
    logger.debug(`[WORKER-MANAGER] Registered worker: ${worker.name}`);
    
    worker.on('error', (err) => {
      logger.error(`[WORKER-MANAGER] Worker ${worker.name} critical error: ${err.message}`, { stack: err.stack });
    });
  }
};

const registerQueue = (queue) => {
  if (queue) {
    queues.push(queue);
    logger.debug(`[WORKER-MANAGER] Registered queue: ${queue.name}`);
  }
};

const getHealthReport = async () => {
  const reports = await Promise.all(queues.map(async (queue) => {
    try {
      const counts = await queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
      return {
        name: queue.name,
        ...counts,
        status: queue.client.status
      };
    } catch (err) {
      return { name: queue?.name, status: 'error', error: err.message };
    }
  }));
  return reports;
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
  getHealthReport,
  shutdown
};
