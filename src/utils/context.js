const { AsyncLocalStorage } = require('async_hooks');

const context = new AsyncLocalStorage();

const runWithContext = (store, fn) => {
  return context.run(store, fn);
};

const getContext = () => {
  return context.getStore() || {};
};

const getRequestId = () => {
  return getContext().requestId;
};

const getJobMetadata = () => {
  return { correlationId: getRequestId() };
};

const runWithJobContext = (job, fn) => {
  const correlationId = job.data?.correlationId;
  return runWithContext({ requestId: correlationId }, fn);
};

module.exports = {
  context,
  runWithContext,
  getContext,
  getRequestId,
  getJobMetadata,
  runWithJobContext,
};
