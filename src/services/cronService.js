const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const ActionRequest = require('../models/ActionRequest');
const actionExecutor = require('./actionExecutor');
const riskMonitorService = require('./riskMonitorService');
const logger = require('../utils/logger');

const SERVICE_NAME = 'CronService (Autonomous Sentinel)';

const start = () => {
  logger.info(`[${SERVICE_NAME}] Autonomous routine managed by BullMQ.`);
};

const runMorningDiagnostic = async () => {
  try {
    const workspaces = await User.distinct('workspaceId');
    for (const workspaceId of workspaces) {
      if (!workspaceId) continue;
      
      logger.info(`[${SERVICE_NAME}] Running intelligence diagnostic for workspace: ${workspaceId}`);
      await riskMonitorService.runProjectRiskAnalysis(workspaceId);
    }
  } catch (error) {
    logger.error(`[${SERVICE_NAME}] Global telemetry failure:`, error);
  }
};

module.exports = {
  start,
  runMorningDiagnostic,
};
