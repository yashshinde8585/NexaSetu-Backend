const cron = require('node-cron');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const ActionRequest = require('../models/ActionRequest');
const actionExecutor = require('./actionExecutor');

// Schedules and triggers routine system health checks and proactive mitigation tasks.
class CronService {
  constructor() {
    this.name = 'CronService (Autonomous Sentinel)';
  }

  start() {
    // Trigger recurring daily tactical health evaluations.
    console.log(`[${this.name}] Initializing autonomous telemetry routines...`);
    cron.schedule('0 8 * * *', async () => {
      console.log(`[${this.name}] Executing morning diagnostic...`);
      await this.runMorningDiagnostic();
    });
  }

  async runMorningDiagnostic() {
    try {
      const projects = await Project.find({ status: 'active' });
      if (!projects || projects.length === 0) return;

      // Interrogate the operational stability of current active portfolios.
      for (const project of projects) {
        if (project.healthScore < 60 || project.healthLabel === 'At Risk') {
          // Identify critical timeframe violations endangering delivery.
          const overdueTasks = await Task.find({
            project: project._id,
            status: { $ne: 'done' },
            dueDate: { $lt: new Date() },
          });

          if (overdueTasks.length > 0) {
            // Buffer failing timelines automatically with tactical extensions.
            for (const task of overdueTasks) {
              await actionExecutor.processDecision({
                type: 'UPDATE_TASK_DEADLINE',
                targetId: task._id,
                targetType: 'Task',
                payload: {
                  newDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
                },
                reason: `Autonomous Sentinel: Project ${project.name} is At Risk. Staging +48h mitigation buffer for delayed deliverables.`,
                agent: 'Nexa Sentinel',
              });
            }
            console.log(
              `[${this.name}] Staged timeline mitigation for ${project.name}`
            );
          }
        }
      }

      // Process global resource loads mapping distinct personnel limits.
      const members = await User.find({});
      for (const m of members) {
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
            reason: `Autonomous Sentinel: Critical Overload (${count} active tasks) detected for user ${m.name}. Executive intervention required.`,
            agent: 'Nexa Sentinel',
            status: 'pending', // Convert routine diagnostic detections into actionable alerts.
          });
          console.log(`[${this.name}] Overload alert generated for ${m.name}`);
        }
      }
    } catch (error) {
      console.error(`[${this.name}] Telemetry failure:`, error);
    }
  }
}

module.exports = new CronService();
