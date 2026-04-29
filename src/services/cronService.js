const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const ActionRequest = require('../models/ActionRequest');
const actionExecutor = require('./actionExecutor');
const logger = require('../utils/logger');

const SERVICE_NAME = 'CronService (Autonomous Sentinel)';

const start = () => {
  logger.info(`[${SERVICE_NAME}] Autonomous routine managed by BullMQ.`);
};

const runMorningDiagnostic = async () => {
  try {
    const projects = await Project.find({ status: 'active' });
    if (!projects || projects.length === 0) return;

    for (const project of projects) {
      try {
        if (project.healthScore < 60 || project.healthLabel === 'At Risk') {
          const overdueTasks = await Task.find({
            project: project._id,
            status: { $ne: 'done' },
            dueDate: { $lt: new Date() },
          });

          if (overdueTasks.length > 0) {
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
                logger.error(`[${SERVICE_NAME}] Failed to mitigate task ${task._id}: %s`, taskErr.message);
              }
            }
            logger.info(`[${SERVICE_NAME}] Staged timeline mitigation for ${project.name}`);
          }
        }
      } catch (projErr) {
        logger.error(`[${SERVICE_NAME}] Diagnostic failed for project ${project.name}: %s`, projErr.message);
      }
    }

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
          logger.info(`[${SERVICE_NAME}] Overload alert generated for ${m.name}`);
        }
      } catch (userErr) {
        logger.error(`[${SERVICE_NAME}] Diagnostic failed for user ${m.name}: %s`, userErr.message);
      }
    }
  } catch (error) {
    logger.error(`[${SERVICE_NAME}] Global telemetry failure:`, error);
  }
};

module.exports = {
  start,
  runMorningDiagnostic,
};
