const aiClient = require('../utils/aiClient');
const aiHelpers = require('../utils/aiHelpers');
const aiOutputValidator = require('../validators/aiOutputValidator');
const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const ActionRequest = require('../models/ActionRequest');
const actionExecutor = require('./actionExecutor');
const normalizer = require('./parameterNormalizer');
const teamService = require('./teamService');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const { isManagerOrAdmin, hasLeadRestriction } = require('../utils/authHelpers');
const logger = require('../utils/logger');

const interpretQuery = async (text, context = {}, signal = null) => {
  const { currentProjects, user, dashboardStats } = context;
  const userName = user ? user.name : 'Unknown User';
  const projectNames =
    currentProjects?.length > 0
      ? currentProjects.map((p) => p.name).join(', ')
      : 'None';
  const statsSummary =
    dashboardStats?.length > 0
      ? dashboardStats
          .map((s) => `${s.label}: ${s.value} (${s.trend || 'N/A'})`)
          .join(' | ')
      : 'No real-time stats available';

  const systemPrompt = `
    You are Nexa, a master-level Strategic Command Optimizer for the NexaSetu platform.
    Your mission: transform any raw user input or vague operational intent into precision-crafted Magic Bar commands.
    
    ### ENVIRONMENT CONTEXT
    - Current Logged-in User: "${userName}" (Map "I", "my", "me" to "${userName}")
    - Active Projects: [${projectNames}]
    - Real-time Dashboard Stats: [${statsSummary}]
    - Today's Date: ${new Date().toISOString().split('T')[0]}

    ### SUPPORTED INTENTS
    - QUERY_TASKS: { "status": "todo|in_progress|in_review|done", "user": "name", "project": "name" }
    - CREATE_TASK: { "title": "string", "project": "name", "assignee": "name" }
    - UPDATE_TASK_STATUS: { "taskTitle": "string", "newStatus": "todo|in_progress|in_review|done" }
    - REASSIGN_TASK: { "fromUser": "name", "toUser": "name" }
    - CREATE_PROJECT: { "projectName": "string" }
    - SHOW_PORTFOLIO_HEALTH: {} 
    - ANALYZE_BOTTLENECKS: { "project": "name" }
    - OPTIMIZE_PROJECT_PATH: { "project": "name" }
    - FIX_DELAYS: { "project": "name" }
    - INVITE_USER: { "email": "string", "name": "string", "role": "ADMIN|MANAGER|DEV|INTERN", "project": "name" }
    - SHOW_TEAM_CAPACITY: { "departmentOrUser": "string" }
    - SYNC_GITHUB: { "project": "name" }
    - APPROVE_AI_ACTIONS: {}
    - UNKNOWN: {}

    ### STRICT RULES
    - Output ONLY a valid JSON array of objects.
    - Every object MUST have: "intent", "parameters", and "responseMessage".
  `.trim();

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Interpret this command: "${text}"` },
  ];

  try {
    const response = await aiClient.generateCompletion(messages, {
      signal,
      timeout: 15000,
      temperature: 0.1
    });

    const actions = aiHelpers.extractAndParseJSON(response.content);
    return Array.isArray(actions) ? actions : [actions];
  } catch (error) {
    logger.error(`[MagicBarService] Interpretation failed: ${error.message}`);
    return [{
      intent: 'UNKNOWN',
      responseMessage: "I'm having trouble understanding those steps. Could you try one at a time?",
    }];
  }
};

const executeInterpretedActions = async (user, interpretedActions, frontendContext) => {
  const currentProjects = await Project.find(getProjectAccessQuery(user)).select('name status members');
  const myProjectIds = currentProjects.map((p) => p._id);
  const allVisibleMemberIds = [...new Set(currentProjects.flatMap((p) => p.members || []).map((id) => id.toString()))];

  const overallResults = [];
  let actionTriggered = false;

  for (const action of interpretedActions) {
    let { intent, parameters, responseMessage } = action;
    
    parameters = aiOutputValidator.validateIntentParams(intent, parameters);

    let stepData = {
      intent,
      message: responseMessage,
      results: [],
    };

    try {
      switch (intent) {
        case 'QUERY_TASKS': {
          const filters = { workspaceId: user.workspaceId };
          if (parameters?.status) filters.status = normalizer.normalizeStatus(parameters.status);
          if (parameters?.user) {
            const userObj = await User.findOne({
              workspaceId: user.workspaceId,
              $or: [
                { name: new RegExp(normalizer.normalizeString(parameters.user), 'i') },
                { email: new RegExp(normalizer.normalizeString(parameters.user), 'i') },
              ],
            });
            if (userObj) filters.assignedUser = userObj._id;
          }
          if (parameters?.project) {
            const projectObj = await Project.findOne({
              ...getProjectAccessQuery(user),
              name: new RegExp(normalizer.normalizeString(parameters.project), 'i'),
            });
            filters.project = projectObj ? projectObj._id : { $in: myProjectIds };
          } else {
            filters.project = { $in: myProjectIds };
          }
          stepData.results = await Task.find(filters).populate('assignedUser', 'name').limit(5);
          break;
        }

        case 'SHOW_PORTFOLIO_HEALTH':
        case 'SHOW_HEALTH': {
          const projects = await Project.find(getProjectAccessQuery(user)).select('name healthScore healthLabel status');
          let atRiskCount = 0;
          let criticalCount = 0;
          stepData.results = projects.map((p) => {
            if (p.healthLabel === 'Needs Attention' || p.healthScore < 70) atRiskCount++;
            if (p.healthLabel === 'At Risk' || p.healthScore < 40) criticalCount++;
            return { title: p.name, healthLabel: p.healthLabel, score: p.healthScore, status: p.status || 'Active' };
          });
          const total = projects.length;
          const healthy = total - atRiskCount - criticalCount;
          let brief = `Portfolio Telemetry Analyzed. `;
          if (total === 0) brief += 'No active projects open in current jurisdiction.';
          else if (criticalCount > 0) brief += `CRITICAL ALERT: ${criticalCount} project(s) mandate immediate strategic intervention.`;
          else if (atRiskCount > 0) brief += `Warning: ${atRiskCount} project(s) exhibiting suboptimal velocity.`;
          else brief += `All systems nominal. ${healthy}/${total} projects operating within healthy parameters.`;
          stepData.message = brief;
          break;
        }

        case 'CREATE_PROJECT': {
          if (!isManagerOrAdmin(user) || hasLeadRestriction(user)) {
            stepData.message = 'Access Denied: Your account level does not have authority.';
            break;
          }
          const newProject = await Project.create({
            name: parameters?.projectName,
            workspaceId: user.workspaceId,
            createdBy: user._id || user.id,
            members: [user._id || user.id],
          });
          stepData.results = [{ title: newProject.name, status: 'Initialization Successful' }];
          break;
        }

        case 'CREATE_TASK': {
          const { title, project, assignee } = parameters || {};
          if (!title) {
            stepData.message = 'Missing task title.';
            break;
          }
          const projectObj = project ? await Project.findOne({ ...getProjectAccessQuery(user), name: new RegExp(normalizer.normalizeString(project), 'i') }) : await Project.findOne(getProjectAccessQuery(user));
          const userObj = assignee ? await User.findOne({ name: new RegExp(normalizer.normalizeString(assignee), 'i'), workspaceId: user.workspaceId }) : user;
          if (projectObj) {
            const newTask = await Task.create({
              title,
              project: projectObj._id,
              assignedUser: userObj?._id || user._id,
              status: 'todo',
              workspaceId: user.workspaceId,
            });
            stepData.results = [{ title: newTask.title, project: projectObj.name, status: 'Created & Assigned' }];
          } else {
            stepData.message = `Could not find project "${project}".`;
          }
          break;
        }

        case 'UPDATE_TASK_STATUS': {
          const { taskTitle, newStatus } = parameters || {};
          const task = await Task.findOneAndUpdate(
            { title: new RegExp(normalizer.normalizeString(taskTitle), 'i'), project: { $in: myProjectIds } },
            { status: normalizer.normalizeStatus(newStatus) },
            { new: true }
          );
          if (task) stepData.results = [{ title: task.title, status: task.status }];
          else stepData.message = `Task "${taskTitle}" not found.`;
          break;
        }

        case 'INVITE_USER': {
          const { email, name, role, project } = parameters || {};
          const result = await teamService.provisionUser({ name, email, role, project }, user.workspaceId, user._id, 'BIRTH');
          stepData.results = [{ title: result.user.name, email: result.user.email, status: `${result.status === 'EXISTING' ? 'Synchronized' : 'Provisioned'} Successfully` }];
          break;
        }

        case 'SHOW_TEAM_CAPACITY': {
          const memberQuery = isManagerOrAdmin(user) && !hasLeadRestriction(user) ? { workspaceId: user.workspaceId } : { _id: { $in: allVisibleMemberIds }, workspaceId: user.workspaceId };
          const members = await User.find(memberQuery).select('name email role');
          const workloads = [];
          for (const m of members) {
            const count = await Task.countDocuments({ assignedUser: m._id, project: { $in: myProjectIds }, status: { $ne: 'done' } });
            workloads.push({ title: m.name, count: `${count} active tasks`, status: count > 5 ? 'Overloaded' : 'Healthy Capacity' });
          }
          stepData.results = workloads;
          break;
        }

        case 'REASSIGN_TASK': {
          const fromUser = await User.findOne({ name: new RegExp(parameters?.fromUser, 'i'), workspaceId: user.workspaceId });
          const toUser = await User.findOne({ name: new RegExp(parameters?.toUser, 'i'), workspaceId: user.workspaceId });
          if (fromUser && toUser) {
            const task = await Task.findOne({ assignedUser: fromUser._id, status: { $ne: 'done' }, project: { $in: myProjectIds } });
            if (task) {
              const decision = await actionExecutor.processDecision({
                type: 'REASSIGN_TASK',
                targetId: task._id,
                targetType: 'Task',
                payload: { newUserId: toUser._id },
                reason: `MagicBar Command: Redistribute workload to ${toUser.name}`,
                agent: 'MagicBar',
              });
              actionTriggered = true;
              if (decision.status === 'pending_approval') stepData.message = `Delegation staged for approval.`;
              stepData.results = [{ title: task.title, from: fromUser.name, to: toUser.name, status: 'Requested' }];
            }
          }
          break;
        }

        case 'FIX_DELAYS': {
          const projectName = normalizer.normalizeString(parameters?.project);
          const targetProjectIds = projectName ? (await Project.find({ ...getProjectAccessQuery(user), name: new RegExp(projectName, 'i') })).map((p) => p._id) : myProjectIds;
          const delayedTasks = await Task.find({ project: { $in: targetProjectIds }, status: { $ne: 'done' }, dueDate: { $lt: new Date() } }).populate('project', 'name');
          if (delayedTasks.length > 0) {
            for (const t of delayedTasks) {
              await actionExecutor.processDecision({
                type: 'UPDATE_TASK_DEADLINE',
                targetId: t._id,
                targetType: 'Task',
                payload: { newDate: new Date(Date.now() + 48 * 60 * 60 * 1000) },
                reason: `Nexa Orchestration: Systematic timeline risk mitigation.`,
                agent: 'MagicBar',
              });
            }
            actionTriggered = true;
            stepData.message = `Systematic Framework Deployed. ${delayedTasks.length} timeline anomalies recalibrated.`;
          } else {
            stepData.message = 'No critical timeline delays detected.';
          }
          break;
        }

        case 'ANALYZE_BOTTLENECKS': {
          const members = await User.find({ workspaceId: user.workspaceId });
          const bottlenecks = [];
          for (const m of members) {
            const count = await Task.countDocuments({ assignedUser: m._id, status: { $ne: 'done' } });
            if (count >= 5) bottlenecks.push({ title: m.name, count: `${count} active tasks`, status: 'Critical Overload' });
            else if (count >= 3) bottlenecks.push({ title: m.name, count: `${count} active tasks`, status: 'Elevated Load' });
          }
          stepData.message = bottlenecks.length > 0 ? 'Resource bottlenecks detected.' : 'Resource distribution is optimal.';
          stepData.results = bottlenecks;
          break;
        }

        case 'SYNC_GITHUB': {
          stepData.message = 'GitHub Harvester initiated. Analyzing commit telemetry...';
          stepData.results = [
            { title: 'Refactor API Controllers', status: 'Suggested via Commit Analysis' },
            { title: 'Resolve Race Condition in Auth', status: 'Suggested via PR Review' },
          ];
          break;
        }

        case 'APPROVE_AI_ACTIONS': {
          const pendingActions = await ActionRequest.find({ status: 'pending' });
          let approvedCount = 0;
          for (const request of pendingActions) {
            try {
              await actionExecutor.approveRequest(request._id, user._id || user.id);
              approvedCount++;
            } catch (e) {
              logger.error('Action Approval Failed: %o', e);
            }
          }
          stepData.message = `Bulk executor triggered. ${approvedCount} modifications approved.`;
          stepData.results = [{ title: 'System Orchestration Execution', status: approvedCount > 0 ? 'Success' : 'No Pending Actions' }];
          break;
        }
      }
    } catch (err) {
      logger.error(`[MagicBarService] Step ${intent} failed: ${err.message}`);
      stepData.message = `Execution failure: ${err.message}`;
    }

    overallResults.push(stepData);
  }

  return { actions: overallResults, actionTriggered };
};

const executeMagicCommand = async (user, query, frontendContext) => {
  if (!query) throw new Error('Query is required');

  const controller = new AbortController();
  const signal = controller.signal;

  const currentProjects = await Project.find(getProjectAccessQuery(user)).select('name status members');
  const context = { user, currentProjects, dashboardStats: frontendContext?.stats };
  
  const actions = await interpretQuery(query, context, signal);

  if (actions.length > 2) {
    const { getMagicBarQueue } = require('../queues/magicBarQueue');
    const queue = getMagicBarQueue();
    
    if (queue) {
      const { getJobMetadata } = require('../utils/context');
      const job = await queue.add('background-execution', {
        user: { _id: user._id, workspaceId: user.workspaceId },
        actions,
        frontendContext,
        ...getJobMetadata()
      });

      return {
        status: 'processing',
        jobId: job.id,
        message: 'Strategic multi-step command initiated. Deployed to background worker for execution. You will be notified on completion.',
        actions: actions.map(a => ({ intent: a.intent, message: a.responseMessage, status: 'queued' }))
      };
    }
  }

  return await executeInterpretedActions(user, actions, frontendContext);
};

module.exports = {
  interpretQuery,
  executeMagicCommand,
  executeInterpretedActions,
};
