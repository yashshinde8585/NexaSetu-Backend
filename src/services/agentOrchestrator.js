const Task = require('../models/Task');
const Project = require('../models/Project');
const AILog = require('../models/AILog');
const harvesterAgent = require('./harvesterAgent');
const schedulerAgent = require('./schedulerAgent');
const actionExecutor = require('./actionExecutor');
const aiService = require('./aiService');
const { getIO, EVENTS } = require('../socket');
const logger = require('../utils/logger');

const handleEvent = async (event) => {
  try {
    const { getOrchestratorQueue } = require('../queues/orchestratorQueue');
    const { isQueueConnected } = require('../config/redis');
    const { getJobMetadata } = require('../utils/context');
    const queue = getOrchestratorQueue();

    if (queue && isQueueConnected()) {
      await queue.add(`event:${event.type}`, { 
        event,
        ...getJobMetadata()
      }, {
        jobId: event.entityId ? `${event.type}:${event.entityId}` : undefined,
        removeOnComplete: true
      });
      return { status: 'queued', eventType: event.type };
    }

    logger.error(`[ORCHESTRATOR] Queue Service Offline. Event ${event.type} for ${event.entityId} could not be dispatched.`);
    return { status: 'failed', reason: 'Queue Service Offline' };
  } catch (err) {
    logger.error(`[ORCHESTRATOR] Failed to dispatch event ${event.type}: ${err.message}`);
    return { status: 'failed', error: err.message };
  }
};

const processEvent = async (event) => {
  try {
    const { type, payload, project, entityId, entityType } = event;
    let workspaceId = event.workspaceId;

    logger.info(`[ORCHESTRATOR] Processing ${type} for ${entityType}:${entityId}`);

    if (!workspaceId && project) {
      const projectDoc = await Project.findById(project).select('workspaceId');
      if (projectDoc) {
        workspaceId = projectDoc.workspaceId;
      }
    }

    if (!workspaceId) {
      logger.warn(`[ORCHESTRATOR] Missing workspaceId for event ${type}. Skipping AILog creation.`);
      return { status: 'incomplete', reason: 'Missing workspaceId' };
    }

    let decision = 'monitoring';
    let actionTaken = 'logged';
    let agent = 'Orchestrator';
    let reason = 'System standard monitoring';
    let actionsToExecute = [];

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

    for (const actionReq of actionsToExecute) {
      await actionExecutor.processDecision(actionReq);
    }

    const existingLog = await AILog.findOne({ 
      eventType: type, 
      entityId,
      timestamp: { $gt: new Date(Date.now() - 5000) } 
    });

    if (existingLog) {
      logger.info(`[ORCHESTRATOR] Duplicate event ${type} for ${entityId} suppressed.`);
      return existingLog;
    }

    const log = await AILog.create({
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

    try {
      const { getEmitter, EVENTS } = require('../socket');
      const projectId = (project || (payload && payload.project))?.toString();
      if (projectId) {
        getEmitter().to(projectId).emit(EVENTS.AGENT_ACTIVITY, log);
      }
    } catch (err) {
      logger.warn(`[ORCHESTRATOR] Real-time broadcast failed for event ${type}`);
    }

    return log;
  } catch (error) {
    logger.error(`[ORCHESTRATOR] Event processing failed for ${event.type}: ${error.message}`);
    throw error; 
  }
};

const scanForDelays = async () => {
  const now = new Date();
  try {
    const tasks = await Task.find({
      status: { $ne: 'done' },
      dueDate: { $lt: now },
    });

    for (const task of tasks) {
      const cooldownPeriod = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingLog = await AILog.findOne({
        eventType: 'TASK_DELAYED',
        entityId: task._id,
        timestamp: { $gt: cooldownPeriod },
      });

      if (!existingLog) {
        await handleEvent({
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
};

const processCommand = async (prompt, user) => {
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
};

module.exports = {
  handleEvent,
  processEvent,
  scanForDelays,
  processCommand,
};
