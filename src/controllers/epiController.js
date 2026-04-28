const epiService = require('../services/epiService');
const logger = require('../utils/logger');

/**
 * EPI Controller
 * Handles requests for project insights.
 */

exports.getSprintEPI = async (req, res) => {
  try {
    const { sprintId } = req.params;
    if (!sprintId) {
      return res.status(400).json({ status: 'error', message: 'sprintId is required' });
    }

    const data = await epiService.getSprintEPI(sprintId);
    res.json({
      status: 'success',
      data
    });
  } catch (error) {
    logger.error('[EPIController] getSprintEPI failed: %o', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error while generating Sprint EPI'
    });
  }
};

exports.getTaskEPI = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ status: 'error', message: 'taskId is required' });
    }

    const data = await epiService.getTaskEPI(taskId);
    res.json({
      status: 'success',
      data
    });
  } catch (error) {
    logger.error('[EPIController] getTaskEPI failed: %o', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error while generating Task EPI'
    });
  }
};

exports.getTaskHelp = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
        return res.status(400).json({ status: 'error', message: 'taskId is required' });
    }

    const data = await epiService.getTaskImplementationHelp(taskId);
    res.json({
      status: 'success',
      data
    });
  } catch (error) {
    logger.error('[EPIController] getTaskHelp failed: %o', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error while generating Task Help'
    });
  }
};

exports.executeAction = async (req, res) => {
  try {
    const { actionType, metadata } = req.body;
    if (!actionType || !metadata) {
      return res.status(400).json({ status: 'error', message: 'actionType and metadata are required' });
    }

    const result = await epiService.executeAction(actionType, metadata);
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error('[EPIController] executeAction failed: %o', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Action execution failed'
    });
  }
};

exports.getNarrativeReport = async (req, res) => {
  try {
    const { sprintId } = req.params;
    const { type = 'EXECUTIVE' } = req.query;
    
    const report = await epiService.generateNarrativeReport(sprintId, type);
    res.json({
        status: 'success',
        data: report
    });
  } catch (error) {
    logger.error('[EPIController] getNarrativeReport failed: %o', error);
    res.status(500).json({
        status: 'error',
        message: 'Failed to generate stakeholder report'
    });
  }
};
