const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const magicBarService = require('../services/magicBarService');
const actionExecutor = require('../services/actionExecutor');
const normalizer = require('../services/parameterNormalizer');

/**
 * Controller for the AI Magic Bar Interface
 */

exports.executeMagicCommand = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ status: 'fail', message: 'Query is required' });

    // 0. FETCH CONTEXT
    const currentProjects = await Project.find({ members: req.user.id }).select('name');
    const context = {
        user: req.user,
        currentProjects
    };

    // 1. NLP INTERPRETATION (returns array of actions)
    const interpretedActions = await magicBarService.interpretQuery(query, context);
    
    const overallResults = [];
    let actionTriggered = false;

    // 2. PROCESS EACH ACTION
    for (const action of interpretedActions) {
      const { intent, parameters } = action;
      let stepData = { intent, message: action.responseMessage, results: null };

      switch (intent) {
        case 'QUERY_TASKS': {
          const myProjectIds = currentProjects.map(p => p._id);
          const filters = { project: { $in: myProjectIds } };
          
          if (parameters?.status) filters.status = normalizer.normalizeStatus(parameters.status);
          
          if (parameters?.user) {
              const userObj = await User.findOne({ name: new RegExp(normalizer.normalizeString(parameters.user), 'i') });
              if (userObj) filters.assignedUser = userObj._id;
          }

          stepData.results = await Task.find(filters).populate('assignedUser', 'name').limit(5);
          break;
        }

        case 'SHOW_HEALTH': {
            stepData.results = await Project.find({ members: req.user.id }).select('name healthScore healthLabel');
            break;
        }

        case 'REASSIGN_TASK': {
            const from = normalizer.normalizeString(parameters?.fromUser);
            const to = normalizer.normalizeString(parameters?.toUser);
            if (!from || !to) break;

            const fromUser = await User.findOne({ name: new RegExp(from, 'i') });
            const toUser = await User.findOne({ name: new RegExp(to, 'i') });

            if (fromUser && toUser) {
                const tasks = await Task.find({ assignedUser: fromUser._id, status: { $ne: 'done' } });
                if (tasks.length > 0) {
                    const decision = await actionExecutor.processDecision({
                        type: 'REASSIGN_TASK',
                        targetId: tasks[0]._id,
                        targetType: 'Task',
                        payload: { newUserId: toUser._id },
                        reason: `AI Normalizer Resolved: Move from ${fromUser.name} to ${toUser.name}`,
                        agent: 'MagicBar'
                    });
                    actionTriggered = true;
                    if (decision.status === 'pending_approval') {
                        stepData.message = `High-impact change: Reassigning "${tasks[0].title}" requires manual board approval.`;
                    }
                }
            }
            break;
        }

        case 'FIX_DELAYS': {
            const projectName = normalizer.normalizeString(parameters?.project);
            const projectFilters = {};
            if (projectName) {
                const projectObj = await Project.findOne({ name: new RegExp(projectName, 'i'), members: req.user.id });
                if (projectObj) projectFilters.project = projectObj._id;
            } else {
                projectFilters.project = { $in: currentProjects.map(p => p._id) };
            }

            const delayedTasks = await Task.find({ 
                ...projectFilters, 
                status: { $ne: 'done' }, 
                dueDate: { $lt: new Date() } 
            });

            if (delayedTasks.length > 0) {
                // Bulk action with unified policy check
                for (const t of delayedTasks) {
                    await actionExecutor.processDecision({
                        type: 'UPDATE_TASK_DEADLINE',
                        targetId: t._id,
                        targetType: 'Task',
                        payload: { 
                            newDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
                            daysShifted: 2 
                        },
                        reason: `AI Batch Fix: ${query}`,
                        agent: 'MagicBar'
                    });
                }
                actionTriggered = true;
                stepData.message = `Dispatched ${delayedTasks.length} timeline adjustments for your approval.`;
            } else {
                stepData.message = "All tasks in scope are currently on track.";
            }
            break;
        }

        default:
          break;
      }
      overallResults.push(stepData);
    }

    res.status(200).json({
      status: 'success',
      data: {
        actions: overallResults,
        actionTriggered
      }
    });


  } catch (error) {
    console.error('[MagicBarController] Error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to process magic command' });
  }
};

// Helper: Get project IDs for the user
async function getMyProjects(userId) {
    const projects = await Project.find({ members: userId });
    return projects.map(p => p._id);
}
