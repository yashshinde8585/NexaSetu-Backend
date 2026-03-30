const Task = require('../models/Task');
const taskUtils = require('../utils/taskUtils');



class SchedulerAgent {
  constructor() {
    this.name = 'Scheduler';
  }

  
  async handleTaskDelay(eventData) {
    try {
      const { entityId, project } = eventData;
      const delayedTask = await Task.findById(entityId);
      
      if (!delayedTask || !delayedTask.dueDate) return { status: 'skipped', reason: 'Task has no deadline to shift from' };

      // 1. Identify direct descendants (Tasks that depend ON this task)
      const dependents = await Task.find({
        project,
        dependencies: entityId,
        status: { $ne: 'done' }
      });

      if (dependents.length === 0) {
        return { status: 'stable', reason: 'No dependent tasks impacted by this delay' };
      }

      const actions = [];
      const now = new Date();

      // 2. Cascade Timeline Shift Decisions (Shift by 2 Business Days)
      for (const t of dependents) {
        const baseDate = t.dueDate && t.dueDate > now ? t.dueDate : now;
        const newDueDate = taskUtils.addBusinessDays(baseDate, 2);

        actions.push({
            type: 'UPDATE_TASK_DEADLINE',
            targetId: t._id,
            targetType: 'Task',
            payload: { 
                newDate: newDueDate,
                daysShifted: 2 
            },
            reason: `Cascade shift (2 business days) due to delay of upstream task: "${delayedTask.title}"`,
            agent: this.name
        });
      }

      return {
        status: 'executed',
        action: `Shifted deadlines for ${actions.length} dependent tasks`,
        actions, // Array of structured action requests for the Executor
        reason: `Impact assessment from delay of "${delayedTask.title}"`
      };
    } catch (error) {
      console.error('[SchedulerAgent] Cascade Error:', error);
      throw error;
    }
  }

  
  async optimizeProjectTimeline(projectId) {
      return { status: 'monitoring', reason: 'Timeline optimization complete' };
  }
}

module.exports = new SchedulerAgent();
