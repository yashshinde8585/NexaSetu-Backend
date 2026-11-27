const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const ActionRequest = require('../models/ActionRequest');
const actionExecutor = require('./actionExecutor');
const riskMonitorService = require('./riskMonitorService');
const logger = require('../utils/logger');

const SERVICE_NAME = 'Jobs';

const start = () => {
  logger.info(`[${SERVICE_NAME}] Scheduled jobs managed by BullMQ`);
};

const runMorningDiagnostic = async () => {
  try {
    const workspaces = await User.distinct('workspaceId');
    for (const workspaceId of workspaces) {
      if (!workspaceId) continue;

      logger.debug(
        `[${SERVICE_NAME}] Running risk analysis for workspace ${workspaceId}`
      );
      await riskMonitorService.runProjectRiskAnalysis(workspaceId);
    }
  } catch (error) {
    logger.error(`[${SERVICE_NAME}] Morning risk analysis failed:`, error);
  }
};

module.exports = {
  start,
  runMorningDiagnostic,
};
