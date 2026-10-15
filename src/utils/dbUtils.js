const mongoose = require('mongoose');
const logger = require('./logger');

const runInTransaction = async (fn) => {
  const client = mongoose.connection.getClient();
  const description = client?.topology?.description;
  const topologyType = description?.type;

  const supportsTransactions =
    topologyType === 'ReplicaSetWithPrimary' ||
    topologyType === 'ReplicaSetNoPrimary' ||
    topologyType === 'Sharded';

  if (!supportsTransactions) {
    logger.debug(
      `[DB-UTILS] Running without transaction (Topology: ${topologyType || 'Unknown'})`
    );
    return await fn(null);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  runInTransaction,
};
