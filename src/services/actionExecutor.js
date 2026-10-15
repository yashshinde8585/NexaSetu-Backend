const mongoose = require('mongoose');
const ActionRequest = require('../models/ActionRequest');
const Task = require('../models/Task');
const Project = require('../models/Project');
const executionPolicy = require('./executionPolicy');
const aiOutputValidator = require('../validators/aiOutputValidator');
const logger = require('../utils/logger');

const processDecision = async (decision) => {
  try {
    const { type, targetId, targetType, payload, agent, reason } = decision;

    if (!type || !targetId || !payload) {
      throw new Error('Incomplete action data');
    }

    const mode =
      decision.mode || executionPolicy.getExecutionMode(type, payload);

    logger.info(
      `[ActionExecutor] Processing ${type} (Mode: ${mode}) for agent: ${agent}`
    );

    if (mode === 'auto') {
      const result = await executeImmediately(
        type,
        targetId,
        targetType,
        payload,
        reason,
        agent
      );
      return { status: 'executed', ...result };
    } else {
      // Create a pending request for manual supervisor approval.
      const request = await ActionRequest.create({
        type,
        targetId,
        targetType,
        payload,
        reason,
        agent,
        status: 'pending',
      });
      return {
        status: 'pending_approval',
        requestId: request._id,
        mode: 'approval',
      };
    }
  } catch (error) {
    logger.error(`[ActionExecutor] Processing Error: ${error.message}`);
    throw error;
  }
};

const executeImmediately = async (
  type,
  targetId,
  targetType,
  payload,
  reason,
  agent
) => {
  let result = null;
  let oldValue = null;
  let newValue = null;

  try {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Action payload must be a valid object');
    }

    // Validate AI-driven output to prevent system state corruption.
    const aiAgents = ['Scheduler', 'Harvester', 'Portfolio'];
    if (aiAgents.includes(agent)) {
      if (payload.newDate && isNaN(new Date(payload.newDate).getTime())) {
        throw new Error('AI generated invalid date for task shift');
      }
    }

    switch (type) {
      case 'UPDATE_TASK_DEADLINE':
        oldValue = await Task.findById(targetId, 'dueDate');
        if (!oldValue) throw new Error('Task not found');

        result = await Task.findByIdAndUpdate(
          targetId,
          {
            dueDate: payload.newDate,
            $push: {
              timelineHistory: {
                oldDueDate: oldValue.dueDate,
                newDueDate: payload.newDate,
                reason: reason || 'Autonomous Scheduler Adjustment',
              },
            },
          },
          { returnDocument: 'after' }
        );
        newValue = result.dueDate;
        break;

      case 'STATUS_CHANGE':
        oldValue = await Task.findById(targetId, 'status');
        if (!oldValue) throw new Error('Task not found');

        result = await Task.findByIdAndUpdate(
          targetId,
          { status: payload.status },
          { returnDocument: 'after' }
        );
        newValue = result.status;
        break;

      case 'REASSIGN_TASK':
        oldValue = await Task.findById(targetId, 'assignedUser');
        if (!oldValue) throw new Error('Task not found');

        result = await Task.findByIdAndUpdate(
          targetId,
          { assignedUser: payload.newUserId },
          { returnDocument: 'after' }
        );
        newValue = result.assignedUser;
        break;

      default:
        throw new Error(`Unsupported action type: ${type}`);
    }

    await ActionRequest.create({
      type,
      targetId,
      targetType,
      payload,
      reason,
      agent,
      status: 'executed',
      executedAt: new Date(),
      oldValue,
      newValue,
    });

    return { result, oldValue, newValue };
  } catch (error) {
    logger.error(`[ActionExecutor] Execution failed: ${error.message}`);
    throw error;
  }
};

const approveRequest = async (requestId, userId) => {
  try {
    const request = await ActionRequest.findById(requestId);
    if (!request || request.status !== 'pending') {
      throw new Error('Request not found or already processed');
    }

    const result = await executeImmediately(
      request.type,
      request.targetId,
      request.targetType,
      request.payload,
      request.reason,
      request.agent
    );

    request.status = 'approved';
    request.executedAt = new Date();
    request.createdBy = userId;
    await request.save();

    return result;
  } catch (error) {
    logger.error(`[ActionExecutor] Approval failed: ${error.message}`);
    throw error;
  }
};

module.exports = {
  processDecision,
  executeImmediately,
  approveRequest,
};
