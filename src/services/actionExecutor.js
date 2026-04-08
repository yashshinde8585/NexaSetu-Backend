const mongoose = require('mongoose');
const ActionRequest = require('../models/ActionRequest');
const Task = require('../models/Task');
const Project = require('../models/Project');
const executionPolicy = require('./executionPolicy');

// Engine for executing and tracking approved system actions.
class ActionExecutor {
  constructor() {
    this.name = 'ActionExecutor';
  }
  async processDecision(decision) {
    try {
      const { type, targetId, targetType, payload, agent, reason } = decision;

      // Validate required payload fields.
      if (!type || !targetId || !payload) {
        throw new Error('Incomplete action data');
      }

      const mode =
        decision.mode || executionPolicy.getExecutionMode(type, payload);

      console.log(
        `[ActionExecutor] Processing ${type} (Mode: ${mode}) for agent: ${agent}`
      );

      if (mode === 'auto') {
        const result = await this.executeImmediately(
          type,
          targetId,
          targetType,
          payload,
          reason,
          agent
        );
        return { status: 'executed', ...result };
      } else {
        // Create a pending request for manual approval.
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
      console.error('[ActionExecutor] Processing Error:', error);
      throw error;
    }
  }

  async executeImmediately(type, targetId, targetType, payload, reason, agent) {
    let result = null;
    let oldValue = null;
    let newValue = null;

    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Execute the requested action type.
      switch (type) {
        case 'UPDATE_TASK_DEADLINE':
          oldValue = await Task.findById(targetId, 'dueDate').session(session);
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
            { returnDocument: 'after', session }
          );
          newValue = result.dueDate;
          break;

        case 'STATUS_CHANGE':
          oldValue = await Task.findById(targetId, 'status').session(session);
          if (!oldValue) throw new Error('Task not found');
          
          result = await Task.findByIdAndUpdate(
            targetId,
            { status: payload.status },
            { returnDocument: 'after', session }
          );
          newValue = result.status;
          break;

        case 'REASSIGN_TASK':
          oldValue = await Task.findById(targetId, 'assignedUser').session(session);
          if (!oldValue) throw new Error('Task not found');
          
          result = await Task.findByIdAndUpdate(
            targetId,
            { assignedUser: payload.newUserId },
            { returnDocument: 'after', session }
          );
          newValue = result.assignedUser;
          break;

        default:
          throw new Error(`Unsupported action type: ${type}`);
      }

      // Persist the executed action to the audit log.
      await ActionRequest.create(
        [{
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
        }],
        { session }
      );

      await session.commitTransaction();
      return { result, oldValue, newValue };
    } catch (error) {
      await session.abortTransaction();
      console.error('[ActionExecutor] Transaction aborted:', error.message);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async approveRequest(requestId, userId) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const request = await ActionRequest.findById(requestId).session(session);
        if (!request || request.status !== 'pending') {
          throw new Error('Request not found or already processed');
        }

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
        await request.save({ session });
        
        return result;
      });
    } catch (error) {
      console.error('[ActionExecutor] Approval transaction failed:', error.message);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new ActionExecutor();
