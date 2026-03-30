const ActionRequest = require('../models/ActionRequest');
const Task = require('../models/Task');
const Project = require('../models/Project');
const executionPolicy = require('./executionPolicy');

class ActionExecutor {
  constructor() {
    this.name = 'ActionExecutor';
  }
  async processDecision(decision) {
    try {
      const { type, targetId, targetType, payload, agent, reason } = decision;

      // 1. ACTION VALIDATION
      if (!type || !targetId || !payload) {
        throw new Error('Incomplete action data');
      }

      const mode = decision.mode || executionPolicy.getExecutionMode(type, payload);

      console.log(`[ActionExecutor] Processing ${type} (Mode: ${mode}) for agent: ${agent}`);

      if (mode === 'auto') {
        const result = await this.executeImmediately(type, targetId, targetType, payload, reason, agent);
        return { status: 'executed', ...result };
      } else {
        // Create a Pending Action Request for the user to approve
        const request = await ActionRequest.create({
          type,
          targetId,
          targetType,
          payload,
          reason,
          agent,
          status: 'pending'
        });
        return { status: 'pending_approval', requestId: request._id, mode: 'approval' };
      }
    } catch (error) {
      console.error('[ActionExecutor] Processing Error:', error);
      throw error;
    }
  }

  async executeImmediately(type, targetId, targetType, payload, reason, agent) {
    let result = null;
    let oldValue = null;
    let newValue = null;

    switch (type) {
      case 'UPDATE_TASK_DEADLINE':
        oldValue = await Task.findById(targetId, 'dueDate');
        result = await Task.findByIdAndUpdate(targetId, { 
            dueDate: payload.newDate,
            $push: {
                timelineHistory: {
                    oldDueDate: oldValue.dueDate,
                    newDueDate: payload.newDate,
                    reason: reason || 'Autonomous Scheduler Adjustment'
                }
            }
        }, { returnDocument: 'after' });
        newValue = result.dueDate;
        break;

      case 'STATUS_CHANGE':
        oldValue = await Task.findById(targetId, 'status');
        result = await Task.findByIdAndUpdate(targetId, { status: payload.status }, { returnDocument: 'after' });
        newValue = result.status;
        break;

      case 'REASSIGN_TASK':
        oldValue = await Task.findById(targetId, 'assignedUser');
        result = await Task.findByIdAndUpdate(targetId, { assignedUser: payload.newUserId }, { returnDocument: 'after' });
        newValue = result.assignedUser;
        break;

      default:
        throw new Error(`Unsupported action type: ${type}`);
    }

    // Always log the execution
    await ActionRequest.create({
        type, targetId, targetType, payload, reason, agent, status: 'executed',
        executedAt: new Date(),
        oldValue, newValue
    });

    return { result, oldValue, newValue };
  }

  
  async approveRequest(requestId, userId) {
      const request = await ActionRequest.findById(requestId);
      if (!request || request.status !== 'pending') throw new Error('Request not found or already processed');

      const result = await this.executeImmediately(
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
  }
}

module.exports = new ActionExecutor();
