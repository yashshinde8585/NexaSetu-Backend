const Task = require('../models/Task');
const Project = require('../models/Project');
const AILog = require('../models/AILog');
const harvesterAgent = require('./harvesterAgent');
const schedulerAgent = require('./schedulerAgent');
const actionExecutor = require('./actionExecutor');
const aiService = require('./aiService'); // Add this for processCommand

class AgentOrchestrator {
  constructor() {
    this.name = 'Orchestrator';
  }
  async handleEvent(event) {
    try {
      const { type, payload, project, user, entityId, entityType } = event;
      
      console.log(`[AgentOrchestrator] Handling ${type} for entity ${entityId}`);

      let decision = 'monitoring';
      let actionTaken = 'logged';
      let agent = 'Orchestrator';
      let reason = 'System standard monitoring';
      let actionsToExecute = [];

      // 1. SELECT AGENT & DECIDE BASED ON EVENT TYPE
      switch (type) {
        case 'TASK_DELAYED':
          agent = 'Scheduler';
          const sResult = await schedulerAgent.handleTaskDelay(event);
          decision = sResult.status === 'executed' ? 'cascade shift' : 'monitoring only';
          actionTaken = sResult.action || sResult.reason;
          reason = 'Task deadline passed without completion';
          actionsToExecute = sResult.actions || [];
          break;

        case 'USER_OVERLOADED':
          agent = 'Resource';
          decision = 'redistribution required';
          actionTaken = 'calculated optimal re-assignment';
          reason = 'User exceeded the 5-task active workload limit';
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

        default:
          break;
      }

      // 2. TRIGGER ACTIONS IF ANY
      for (const actionReq of actionsToExecute) {
          await actionExecutor.processDecision(actionReq);
      }

      // 3. STORE DECISION LOG (Explainability)
      const log = await AILog.create({
        eventType: type,
        project: project || (payload && payload.project),
        entityId,
        entityType,
        agent,
        decision,
        actionTaken,
        reason,
        timestamp: new Date()
      });

      return log;
    } catch (error) {
      console.error('[AgentOrchestrator] Error processing event:', error);
    }
  }

  async scanForDelays() {
    const now = new Date();
    const tasks = await Task.find({
        status: { $ne: 'done' },
        dueDate: { $lt: now }
    });

    for (const task of tasks) {
        // Only trigger once per task to avoid spam
        const existingLog = await AILog.findOne({
            eventType: 'TASK_DELAYED',
            entityId: task._id,
            timestamp: { $gt: new Date(new Date().getTime() - 24 * 60 * 60 * 1000) } // Last 24h
        });

        if (!existingLog) {
            await this.handleEvent({
                type: 'TASK_DELAYED',
                entityId: task._id,
                entityType: 'task',
                project: task.project,
                payload: task
            });
        }
    }
  }

  async processCommand(prompt, user) {
    try {
        console.log(`[AgentOrchestrator] Processing command for user ${user._id}`);
        
        const response = await aiService.processPrompt(prompt);
        
        return {
            status: 'success',
            response,
            processedAt: new Date()
        };
    } catch (error) {
        console.error('[AgentOrchestrator] Command routing failed:', error);
        return {
            status: 'error',
            message: 'Failed to process strategic command',
            error: error.message
        };
    }
  }
}

module.exports = new AgentOrchestrator();
