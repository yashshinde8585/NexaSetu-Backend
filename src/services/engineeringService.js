const Task = require('../models/Task');
const Service = require('../models/Service');
const AuditLog = require('../models/AuditLog');
const { calculateProgress, mapTaskToDashboard, formatDueDate, formatTimeAgo } = require('../utils/dashboardHelpers');

/**
 * Engineering Service
 * Manages operational requirements for developers and engineers.
 */
class EngineeringService {
  /**
   * Fetches workspace data based on specific sub-role
   */
  async getWorkspaceData(userId, workspaceId, subRole) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const [dayMetrics, myTasks, progress] = await Promise.all([
      this._getCommonMetrics(userId, workspaceId, today),
      this._getFilteredTasks(userId, workspaceId, subRole),
      this._getProgress(userId, workspaceId)
    ]);

    const [prStats, activityFeed] = await Promise.all([
      this._getPRStats(userId, workspaceId),
      this._getActivityFeed(userId, workspaceId)
    ]);

    let extraData = {
      prStats,
      activityFeed,
      activity: activityFeed.map(a => ({ text: a.action, time: a.time, type: 'info' })),
      feedback: []
    };

    // Role-specific extensions
    if (subRole === 'SENIOR_ENGINEER') {
      const seData = await this._getSeniorEngineerData(userId, workspaceId);
      extraData = { ...extraData, ...seData };
    } else if (subRole === 'INTERN' || subRole === 'SOFTWARE_ENGINEER' || subRole === 'JUNIOR_ENGINEER' || subRole === 'PROJECT_MEMBER' || subRole === 'SWE') {
      const guidedData = await this._getGuidedData(userId, workspaceId, myTasks[0]);
      
      // Fetch feedback from AuditLogs (e.g., status changes or mentor actions)
      const logs = await AuditLog.find({
        workspaceId,
        $or: [
          { entityId: myTasks[0]?._id },
          { performer: myTasks[0]?.createdBy }
        ],
        action: { $regex: /transition|update|comment/i }
      }).sort('-timestamp').limit(3).lean();

      extraData = { 
        ...extraData, 
        ...guidedData,
        feedback: logs.map(l => ({
          title: l.action.replace(/_/g, ' '),
          message: l.details || 'System verified mission parameters.'
        }))
      };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const activityStats = await this._getActivityCounts(userId, workspaceId, startOfDay);

    // Contextual Blockers for JRE/Intern
    const stuckGuidance = myTasks.filter(t => t.blocked).map(t => {
      let suggestedAction = 'Connect with mentor for technical resolution.';
      let suggestedPerson = t.mentor?.name || 'Team Lead';

      if (t.blockedReason) {
        const reason = t.blockedReason.toLowerCase();
        if (reason.includes('api') || reason.includes('backend') || reason.includes('endpoint')) {
          suggestedAction = 'API dependency identified. Request status update from Backend team.';
        } else if (reason.includes('design') || reason.includes('figma') || reason.includes('ui')) {
          suggestedAction = 'Design assets missing. Check Figma comments or ping UI Designer.';
        } else if (reason.includes('review') || reason.includes('pr')) {
          suggestedAction = 'Code review pending. Ping senior engineer for feedback.';
        } else if (reason.includes('access') || reason.includes('permission')) {
          suggestedAction = 'Access issue. Request required credentials from Workspace Admin.';
        }
      } else if (t.dependencies && t.dependencies.length > 0) {
        suggestedAction = 'Task has unmet dependencies. Coordinate with upstream owners.';
      }

      return {
        issue: t.title,
        suggestedAction,
        suggestedPerson
      };
    });

    // Harmonize naming for all IC dashboards (SWE, JRE, Intern, SE)
    const baseResponse = {
      // Metrics Redundancy
      dayMetrics: {
        ...dayMetrics,
        tasksToday: dayMetrics.myTasks // for JREDashboard
      },
      assignmentMetrics: { // for InternDashboard
        assigned: dayMetrics.myTasks,
        dueToday: dayMetrics.dueToday,
        blocked: dayMetrics.blocked
      },

      // Task Redundancy
      myTasks, 
      guidedTasks: myTasks, // for JREDashboard
      currentTask: myTasks[0] || null, // for InternDashboard
      
      // Blockers Redundancy
      blockers: myTasks.filter(t => t.blocked).map(t => ({ 
        issue: t.title, 
        contact: t.mentor?.name || 'Lead' 
      })),
      stuckGuidance: stuckGuidance.length > 0 ? stuckGuidance : [
        { 
          issue: 'Awaiting Mission Assignment', 
          suggestedAction: 'Sync with Team Lead for next tactical objective.', 
          suggestedPerson: 'Lead' 
        }
      ],
      blockerOptions: [
        { label: 'Requirements Unclear' },
        { label: 'Technical Blocker' },
        { label: 'Environment Issue' }
      ],

      // Progress & Navigation
      progress,
      whatsNext: myTasks.slice(1, 3),
      nextSteps: {
        main: myTasks[1]?.title || 'Next Sprint Planning',
        minor: myTasks[1] ? 'Prepare for mission transition' : 'Sync with Team Lead'
      },

      ...extraData
    };

    // 🚀 Senior Engineer Property Injection (Specific Dashboard Aliases)
    if (subRole === 'SENIOR_ENGINEER') {
      const stalePR = await this._getStalePR(workspaceId);
      return {
        ...baseResponse,
        executionMetrics: {
          tasksAssigned: dayMetrics.myTasks,
          dueToday: dayMetrics.dueToday,
          blocked: dayMetrics.blocked,
          highPriority: myTasks.filter(t => ['high', 'urgent'].includes(t.priority)).length,
          pendingReviews: extraData.prStats?.pendingReview || 0
        },
        workQueue: myTasks,
        myBlockers: baseResponse.blockers.map(b => ({ title: b.issue, waitingOn: b.contact })),
        prStatus: {
          pendingReviews: extraData.prStats?.pendingReview || 0,
          stalePR
        },
        myBugs: myTasks.filter(t => t.title.toLowerCase().includes('bug') || t.title.toLowerCase().includes('defect')),
        activity: {
          commitsToday: activityStats.commitsToday,
          filesChanged: activityStats.filesChanged,
          prsMerged: activityStats.prsMerged
        }
      };
    }

    return baseResponse;
  }

  async _getPRStats(userId, workspaceId) {
    const [open, merged, review] = await Promise.all([
      Task.countDocuments({ workspaceId, assignedUser: userId, source: 'github', status: 'in_progress' }),
      Task.countDocuments({ workspaceId, assignedUser: userId, source: 'github', status: 'done' }),
      Task.countDocuments({ workspaceId, assignedUser: userId, status: 'in_review' })
    ]);

    return { open, merged, pendingReview: review };
  }

  async _getActivityFeed(userId, workspaceId) {
    const logs = await AuditLog.find({ 
      performer: userId, 
      workspaceId 
    }).sort('-timestamp').limit(5).lean();

    return logs.map(log => ({
      action: log.action,
      time: formatTimeAgo(log.timestamp)
    }));
  }

  async _getActivityCounts(userId, workspaceId, startOfDay) {
    const [commits, merged] = await Promise.all([
      Task.countDocuments({ workspaceId, assignedUser: userId, updatedAt: { $gte: startOfDay } }),
      Task.countDocuments({ workspaceId, assignedUser: userId, status: 'done', updatedAt: { $gte: startOfDay } })
    ]);

    return { 
      commitsToday: commits, 
      filesChanged: commits * 2 + 1, // Simulated based on task updates
      prsMerged: merged 
    };
  }

  async _getStalePR(workspaceId) {
    const threshold = 48 * 60 * 60 * 1000; // 48h
    const cutoff = new Date(Date.now() - threshold);
    
    const staleTask = await Task.findOne({
      workspaceId,
      status: 'in_review',
      updatedAt: { $lt: cutoff }
    }).sort('updatedAt').lean();

    if (!staleTask) return null;

    return {
      id: staleTask._id,
      title: staleTask.title,
      pendingDays: Math.floor((Date.now() - staleTask.updatedAt) / (1000 * 60 * 60 * 24))
    };
  }

  async _getCommonMetrics(userId, workspaceId, today) {
    const [myTasksCount, dueToday, blocked] = await Promise.all([
      Task.countDocuments({ workspaceId, assignedUser: userId, status: { $ne: 'done' } }),
      Task.countDocuments({ workspaceId, assignedUser: userId, status: { $ne: 'done' }, dueDate: { $lte: today } }),
      Task.countDocuments({ workspaceId, assignedUser: userId, blocked: true, status: { $ne: 'done' } })
    ]);

    return { 
      myTasks: myTasksCount, 
      dueToday, 
      blocked, 
      remaining: Math.max(0, myTasksCount - dueToday) 
    };
  }


  async _getFilteredTasks(userId, workspaceId, subRole) {
    const limit = 10; // Standardized limit for ICs
    const tasks = await Task.find({
      workspaceId,
      assignedUser: userId,
    }).sort('dueDate priority').limit(limit).populate('createdBy', 'name email').lean();

    return tasks.map(t => {
      const mapped = mapTaskToDashboard(t);
      if (subRole === 'INTERN' || subRole === 'JUNIOR_ENGINEER') {
        mapped.steps = t.steps && t.steps.length > 0 ? t.steps : this._getDefaultSteps();
        mapped.mentor = t.createdBy ? { name: t.createdBy.name, role: 'Mentor' } : { name: 'Lead', role: 'Mentor' };
      }
      return mapped;
    });
  }

  async _getProgress(userId, workspaceId) {
    const total = await Task.countDocuments({ workspaceId, assignedUser: userId });
    const completed = await Task.countDocuments({ workspaceId, assignedUser: userId, status: 'done' });
    return calculateProgress(total, completed);
  }

  async _getSeniorEngineerData(userId, workspaceId) {
    const [ownedModules, helpNeeded] = await Promise.all([
      Service.find({ workspaceId, owner: userId }).limit(5).lean(),
      Task.find({ 
        workspaceId, 
        assignedUser: { $ne: userId }, 
        blocked: true, 
        status: { $ne: 'done' } 
      }).limit(3).populate('assignedUser', 'name').lean()
    ]);

    return {
      moduleOwnership: ownedModules.map(s => ({
        id: s._id,
        name: s.name,
        status: s.status,
        health: (s.technicalDebt?.score || 0) > 70 ? 'Needs refactor' : 'Stable'
      })),
      teamSupport: helpNeeded.map(t => ({ 
        id: t._id,
        teamMember: t.assignedUser?.name || 'Unassigned', 
        issue: t.title,
        reason: t.blockedReason || 'Technical Block'
      }))
    };
  }

  async _getGuidedData(userId, workspaceId, currentTask) {
    const resources = {
      backend: [
        { title: 'PostgreSQL Optimization Guide', link: 'https://www.postgresql.org/docs/current/performance-tips.html' },
        { title: 'Node.js Security Best Practices', link: 'https://nodejs.org/en/docs/guides/security-best-practices/' }
      ],
      frontend: [
        { title: 'React Performance Tuning', link: 'https://reactjs.org/docs/optimizing-performance.html' },
        { title: 'TailwindCSS Layout Patterns', link: 'https://tailwindcss.com/docs/layout' }
      ],
      qa: [
        { title: 'Automated Testing Strategies', link: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
        { title: 'Jest/Vitest Unit Testing', link: 'https://jestjs.io/docs/getting-started' }
      ],
      design: [
        { title: 'Typography & Visual Hierarchy', link: 'https://fonts.google.com/knowledge' },
        { title: 'Figma to Code Workflow', link: 'https://www.figma.com/developers/api' }
      ],
      default: [
        { title: 'NexaSetu System Architecture', link: '#' },
        { title: 'Clean Code Standards', link: 'https://github.com/ryanmcdermott/clean-code-javascript' }
      ]
    };

    const category = currentTask?.category || 'default';
    const activeResources = resources[category] || resources.default;

    return {
      learningSection: {
        topic: category.toUpperCase(),
        resources: activeResources
      },
      nextStep: currentTask ? `Current Focus: ${currentTask.title}` : 'Consult Lead for next mission assignment'
    };
  }

  _getDefaultSteps() {
    return [
      { text: 'Analyze requirements', completed: false },
      { text: 'Implement solution', completed: false },
      { text: 'Self-test', completed: false }
    ];
  }
}

module.exports = new EngineeringService();
