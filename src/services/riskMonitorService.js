const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Directive = require('../models/Directive');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { getIO } = require('../socket');

/**
 * RiskMonitorService - The intelligence layer of the Execution Engine.
 * Automatically detects operational drift and suggests strategic corrections.
 */
const runProjectRiskAnalysis = async (workspaceId) => {
  const projects = await Project.find({ workspaceId, status: 'active' });

  for (const project of projects) {
    const tasks = await Task.find({
      workspaceId,
      project: project._id,
      status: { $ne: 'done' },
    });

    // 1. Deadlock Detection (Blockers with no updates for 48h)
    const deadlocks = tasks.filter(
      (t) =>
        t.blocked && new Date() - new Date(t.updatedAt) > 48 * 60 * 60 * 1000
    );

    if (deadlocks.length > 0) {
      for (const task of deadlocks) {
        // ACT: Autonomous State Transition
        await Task.updateOne(
          { _id: task._id },
          {
            status: 'blocked',
            blocked: true,
            blockedReason:
              'Autonomous Sentinel: Detected 48h+ stagnation. Forced transition to BLOCKED.',
            priority: 'urgent',
            isEscalated: true,
            escalationOwner: project.createdBy, // Auto-escalate to project owner
            $push: {
              timelineHistory: {
                status: 'blocked',
                reason:
                  'Autonomous Sentinel: Deadlock detected. Escalated to Project Owner.',
              },
            },
          }
        );
      }

      await Project.updateOne({ _id: project._id }, { status: 'at_risk' });

      await notifyLeadership(workspaceId, {
        type: 'DEADLOCK_DETECTED',
        title: 'Project Deadlock: Autonomous Escalation',
        message: `${deadlocks.length} blockers in ${project.name} escalated to URGENT due to 48h stagnation. Project marked AT RISK.`,
        projectId: project._id,
      });
    }

    // 2. Velocity Drift (Overdue Critical Path)
    const criticalDrift = tasks.filter(
      (t) =>
        (t.priority === 'urgent' || t.priority === 'high') &&
        t.dueDate &&
        new Date(t.dueDate) < new Date()
    );

    if (criticalDrift.length > 3) {
      // ACT: Create an ActionRequest for an automated directive if drift is severe
      const existingRequest = await require('../models/ActionRequest').findOne({
        targetId: project._id,
        type: 'STABILIZE_SUGGESTION',
        status: 'pending',
      });

      if (!existingRequest) {
        await require('../models/ActionRequest').create({
          type: 'STABILIZE_SUGGESTION',
          targetId: project._id,
          targetType: 'Project',
          payload: { driftCount: criticalDrift.length },
          reason: `Autonomous detection: High velocity drift in critical path. Suggesting STABILIZE directive.`,
          agent: 'Sentinel',
          status: 'pending',
        });
      }

      await suggestDirective(workspaceId, {
        type: 'STABILIZE',
        title: `Stabilization Plan: ${project.name}`,
        description: `Autonomous detected ${criticalDrift.length} overdue critical tasks. Suggesting scope freeze.`,
        priority: 9,
        projectId: project._id,
      });
    }
  }
};

const notifyLeadership = async (workspaceId, data) => {
  // Create system notification for all leadership in workspace
  const leaders = await User.find({
    workspaceId,
    role: { $in: ['CTO', 'VP_ENGINEERING', 'WORKSPACE_ADMIN'] },
  });

  for (const leader of leaders) {
    await Notification.create({
      recipient: leader._id,
      type: 'SYSTEM_ALERT',
      title: data.title,
      message: data.message,
      data: { projectId: data.projectId },
    });
  }

  // Real-time broadcast
  try {
    getIO().to(workspaceId.toString()).emit('RISK_ALERT', data);
  } catch (err) {
    logger.warn('[RiskMonitor] Socket broadcast failed');
  }
};

const suggestDirective = async (workspaceId, data) => {
  // Check if a similar directive already exists to avoid spam
  const existing = await Directive.findOne({
    workspaceId,
    title: data.title,
    status: 'issued',
  });

  if (!existing) {
    logger.info(`[RiskMonitor] Suggesting Directive: ${data.title}`);
    // In a mature system, this might go to an 'approvals' queue.
    // For now, we'll log it and notify leadership to issue it manually.
    await notifyLeadership(workspaceId, {
      ...data,
      title: `AI Suggestion: ${data.title}`,
      message: `${data.description}. Please review and issue Stabilize directive.`,
    });
  }
};

module.exports = {
  runProjectRiskAnalysis,
};
