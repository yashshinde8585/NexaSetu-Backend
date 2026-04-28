const cron = require('node-cron');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const ActionRequest = require('../models/ActionRequest');
const actionExecutor = require('./actionExecutor');
const logger = require('../utils/logger');

// Scheduled background tasks for system monitoring and automated actions.
class CronService {
  constructor() {
    this.name = 'CronService (Autonomous Sentinel)';
  }

  start() {
    logger.info(`[${this.name}] Starting scheduled tasks...`);
    cron.schedule('0 8 * * *', async () => {
      logger.info(`[${this.name}] Running morning routine...`);
      await this.runMorningDiagnostic();
    });
  }

  async runMorningDiagnostic() {
    try {
      const projects = await Project.find({ status: 'active' });
      if (!projects || projects.length === 0) return;

      // Check active projects for overdue tasks.
      for (const project of projects) {
        try {
          if (project.healthScore < 60 || project.healthLabel === 'At Risk') {
            // Find overdue tasks that are not marked as done.
            const overdueTasks = await Task.find({
              project: project._id,
              status: { $ne: 'done' },
              dueDate: { $lt: new Date() },
            });

            if (overdueTasks.length > 0) {
              // Extend deadlines for overdue tasks in at-risk projects.
              for (const task of overdueTasks) {
                try {
                   await actionExecutor.processDecision({
                    type: 'UPDATE_TASK_DEADLINE',
                    targetId: task._id,
                    targetType: 'Task',
                    payload: {
                      newDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
                    },
                    reason: `Autonomous Adjustment: Project ${project.name} is At Risk. Adding +48h buffer.`,
                    agent: 'Sentinel',
                  });
                } catch (taskErr) {
                  logger.error(`[${this.name}] Failed to mitigate task ${task._id}: %s`, taskErr.message);
                }
              }
              logger.info(
                `[${this.name}] Staged timeline mitigation for ${project.name}`
              );
            }
          }
        } catch (projErr) {
          logger.error(`[${this.name}] Diagnostic failed for project ${project.name}: %s`, projErr.message);
        }
      }

      // Check user workload for potential overload.
      const members = await User.find({});
      for (const m of members) {
        try {
          const count = await Task.countDocuments({
            assignedUser: m._id,
            status: { $ne: 'done' },
          });
          if (count >= 5) {
            await ActionRequest.create({
              type: 'ANOMALY_DETECTED',
              targetId: m._id,
              targetType: 'User',
              payload: { count },
              reason: `Overload Detected: ${count} active tasks for user ${m.name}.`,
              agent: 'Sentinel',
              status: 'pending',
            });
            logger.info(`[${this.name}] Overload alert generated for ${m.name}`);
          }
        } catch (userErr) {
          logger.error(`[${this.name}] Diagnostic failed for user ${m.name}: %s`, userErr.message);
        }
      }
    } catch (error) {
      logger.error(`[${this.name}] Global telemetry failure:`, error);
    }
  }
}

module.exports = new CronService();
