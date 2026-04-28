const Task = require('../models/Task');
const Project = require('../models/Project');
const AILog = require('../models/AILog');
const harvesterAgent = require('./harvesterAgent');
const schedulerAgent = require('./schedulerAgent');
const actionExecutor = require('./actionExecutor');
const aiService = require('./aiService');
const logger = require('../utils/logger');

// Manages autonomous cross-service events and triggers specialized agent behaviors.
class AgentOrchestrator {
  constructor() {
    this.name = 'Orchestrator';
  }

  /**
   * High-reliability entry point for system events.
   * Dispatches to a durable background queue for asynchronous processing.
   */
  async handleEvent(event) {
    try {
      const { getOrchestratorQueue } = require('../queues/orchestratorQueue');
      const { isQueueConnected } = require('../config/redis');
      const queue = getOrchestratorQueue();

      if (queue && isQueueConnected()) {
        await queue.add(`event:${event.type}`, { event }, {
          jobId: event.entityId ? `${event.type}:${event.entityId}` : undefined,
          removeOnComplete: true
        });
        return { status: 'queued', eventType: event.type };
      }

      // Fallback to synchronous processing if the queue is not operational
      return await this.processEvent(event);
    } catch (err) {
      logger.error(`[ORCHESTRATOR] Failed to dispatch event ${event.type}: ${err.message}`);
      // Return a partial success status to prevent caller crashes
      return { status: 'failed', error: err.message };
    }
  }

  /**
   * Core logic for event processing. Executed by the background worker.
   */
  async processEvent(event) {
    try {
      const { type, payload, project, entityId, entityType } = event;
      let workspaceId = event.workspaceId;

      logger.info(`[ORCHESTRATOR] Processing ${type} for ${entityType}:${entityId}`);

      // Auto-resolve workspaceId from project if missing
      if (!workspaceId && project) {
        const projectDoc = await Project.findById(project).select('workspaceId');
        if (projectDoc) {
          workspaceId = projectDoc.workspaceId;
        }
      }

      // If still no workspaceId, we cannot proceed with AILog creation
      if (!workspaceId) {
        logger.warn(`[ORCHESTRATOR] Missing workspaceId for event ${type}. Skipping AILog creation.`);
        return { status: 'incomplete', reason: 'Missing workspaceId' };
      }

      let decision = 'monitoring';
      let actionTaken = 'logged';
      let agent = 'Orchestrator';
      let reason = 'System standard monitoring';
      let actionsToExecute = [];

      // Map system events dynamically to specialized domain agents.
      switch (type) {
        case 'TASK_DELAYED':
          agent = 'Scheduler';
          const sResult = await schedulerAgent.handleTaskDelay(event);
          decision = sResult.status === 'executed' ? 'cascade shift' : 'monitoring only';
          actionTaken = sResult.action || sResult.reason;
          reason = 'Task deadline passed without completion';
          actionsToExecute = sResult.actions || [];
          break;

        case 'GITHUB_ACTIVITY':
          agent = 'Harvester';
          const result = await harvesterAgent.processGithubActivity(payload);
          decision = result.status === 'created' ? 'autonomous creation' : 'duplicate ignored';
          actionTaken = result.action || result.reason;
          reason = 'New code activity detected in linked repository';
          break;

        case 'TASK_CREATED':
        case 'TASK_UPDATED':
          agent = 'Portfolio';
          decision = 'metric updated';
          actionTaken = 're-calculated project health score';
          reason = type === 'TASK_CREATED' ? 'New entry impact assessment' : 'Status/Assignment change impact';
          break;

        case 'USER_OVERLOADED':
          agent = 'Resource';
          decision = 'redistribution required';
          actionTaken = 'calculated optimal re-assignment';
          reason = 'User exceeded the active workload threshold';
          break;

        default:
          logger.warn(`[ORCHESTRATOR] Unhandled event type: ${type}`);
          break;
      }

      // Execute confirmed actions via the execution engine.
      for (const actionReq of actionsToExecute) {
        await actionExecutor.processDecision(actionReq);
      }

      // Persist the logic tree for transparency and audit trails.
      return await AILog.create({
        eventType: type,
        workspaceId,
        project: project || (payload && payload.project),
        entityId,
        entityType,
        agent,
        decision,
        actionTaken,
        reason,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error(`[ORCHESTRATOR] Event processing failed for ${event.type}: ${error.message}`);
      throw error; // Essential for worker retry logic
    }
  }

  /**
   * Detects overdue tasks and triggers cascading monitoring events.
   * Includes 24h throttling to prevent notification fatigue.
   */
  async scanForDelays() {
    const now = new Date();
    try {
      const tasks = await Task.find({
        status: { $ne: 'done' },
        dueDate: { $lt: now },
      });

      for (const task of tasks) {
        // Enforce 24h cooldown on delay notifications per task
        const cooldownPeriod = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existingLog = await AILog.findOne({
          eventType: 'TASK_DELAYED',
          entityId: task._id,
          timestamp: { $gt: cooldownPeriod },
        });

        if (!existingLog) {
          await this.handleEvent({
            type: 'TASK_DELAYED',
            entityId: task._id,
            entityType: 'task',
            project: task.project,
            payload: task,
          });
        }
      }
    } catch (error) {
      logger.error(`[ORCHESTRATOR] Delay scan failed: ${error.message}`);
    }
  }

  /**
   * Routes natural language commands to the AI service layer.
   */
  async processCommand(prompt, user) {
    try {
      logger.info(`[ORCHESTRATOR] Processing command for user: ${user._id}`);
      const response = await aiService.processPrompt(prompt);

      return {
        status: 'success',
        response,
        processedAt: new Date(),
      };
    } catch (error) {
      logger.error(`[ORCHESTRATOR] Command execution failed: ${error.message}`);
      return {
        status: 'error',
        message: 'Failed to process strategic command',
        error: error.message,
      };
    }
  }
}

module.exports = new AgentOrchestrator();
