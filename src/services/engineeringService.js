const Task = require('../models/Task');
const Service = require('../models/Service');
const { calculateProgress, mapTaskToDashboard, formatDueDate } = require('../utils/dashboardHelpers');

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

    let extraData = {
      prStats: { open: 0, merged: 0, pendingReview: 0 },
      activityFeed: [],
      activity: [],
      feedback: []
    };

    // Role-specific extensions
    if (subRole === 'SENIOR_ENGINEER') {
      const seData = await this._getSeniorEngineerData(userId, workspaceId);
      extraData = { ...extraData, ...seData };
    } else if (subRole === 'INTERN' || subRole === 'SOFTWARE_ENGINEER' || subRole === 'JUNIOR_ENGINEER' || subRole === 'PROJECT_MEMBER') {
      const guidedData = await this._getGuidedData(userId, workspaceId, myTasks[0]);
      extraData = { ...extraData, ...guidedData };
    }

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
      stuckGuidance: myTasks.filter(t => t.blocked).map(t => ({
        issue: t.title,
        suggestedAction: 'Connect with mentor for technical resolution.',
        suggestedPerson: t.mentor?.name || 'Lead'
      })),
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
          stalePR: null // Can be expanded with a real check
        },
        myBugs: myTasks.filter(t => t.title.toLowerCase().includes('bug') || t.title.toLowerCase().includes('defect')),
        activity: {
          commitsToday: 0,
          filesChanged: 0,
          prsMerged: extraData.prStats?.merged || 0
        }
      };
    }

    return baseResponse;
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
      Service.find({ workspaceId, owner: userId }).limit(5),
      Task.find({ workspaceId, assignedUser: { $ne: userId }, blocked: true, status: { $ne: 'done' } }).limit(3)
    ]);

    return {
      moduleOwnership: ownedModules.map(s => ({
        name: s.name,
        status: s.status,
        health: s.technicalDebt?.score > 70 ? 'Needs refactor' : 'Stable'
      })),
      teamSupport: helpNeeded.map(t => ({ teamMember: 'Member', issue: t.title }))
    };
  }

  async _getGuidedData(userId, workspaceId, currentTask) {
    return {
      learningSection: {
        topic: 'Awaiting Next Objectives',
        resources: []
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
