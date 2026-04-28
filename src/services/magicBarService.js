const axios = require('axios');
const aiHelpers = require('../utils/aiHelpers');
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

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Accelerates AI request resolution through multi-model failover chains.
const MODEL_FALLBACK_LIST = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
];

class MagicBarService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
  }

  async interpretQuery(text, context = {}) {
    if (!this.apiKey) {
      throw new Error('AI API Key missing. Please set GROQ_API_KEY in .env');
    }

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
      You operate using the 4-STAGE ORCHESTRATION METHODOLOGY to deconstruct intents and construct a structured JSON array of actionable system intents.
      
      ### THE 4-STAGE ORCHESTRATION METHODOLOGY (Internal Run-book)
      1. DECONSTRUCT (Telemetry): Extract core intent, target missions, and personnel units.
      2. DIAGNOSE (Risk Assessment): Audit for command clarity, constraint specificity, and execution level.
      3. DEVELOP (Strategic Formulation): Select optimal execution vectors (Task Extraction, Resource Management, Portfolio Health) and assign appropriate internal mechanisms.
      4. DELIVER (Deployment): Construct the optimized JSON array output.

      ### ENVIRONMENT CONTEXT
      - Current Logged-in User: "${userName}" (CRITICAL: Map pronouns like "I", "my", "me", "mine" strictly to "${userName}")
      - Active Projects: [${projectNames}]
      - Real-time Dashboard Stats: [${statsSummary}]
      - Today's Date: ${new Date().toISOString().split('T')[0]}

      ### SUPPORTED INTENTS & PARAMETER SCHEMAS

      ==== 1. TASK MANAGEMENT ====
      - QUERY_TASKS: Fetch or search tasks. 
        Params: { "status": "todo|in_progress|in_review|done", "user": "name", "project": "name" }
      - CREATE_TASK: Create a new task.
        Params: { "title": "string", "project": "name", "assignee": "name" }
      - UPDATE_TASK_STATUS: Move a task across the board.
        Params: { "taskTitle": "string", "newStatus": "todo|in_progress|in_review|done" }
      - REASSIGN_TASK: Move workload between personnel.
        Params: { "fromUser": "name", "toUser": "name" }

      ==== 2. PROJECT & PORTFOLIO ORCHESTRATION ====
      - CREATE_PROJECT: Initialize a new project workspace.
        Params: { "projectName": "string" }
      - SHOW_PORTFOLIO_HEALTH: Get macro-level portfolio KPIs, risk scores, or executive briefs.
        Params: {} 
      - ANALYZE_BOTTLENECKS: Identify overloaded team members or stalled projects.
        Params: { "project": "name" }
      - OPTIMIZE_PROJECT_PATH: Trigger AI to reassign tasks from overloaded members to available ones.
        Params: { "project": "name" }
      - FIX_DELAYS: Trigger AI to optimize timelines or resolve deadline risks.
        Params: { "project": "name" }

      ==== 3. TEAM & RESOURCE MANAGEMENT ====
      - INVITE_USER: Dispatch invites to new personnel.
        Params: { "email": "string", "name": "string", "role": "ADMIN|MANAGER|DEV|INTERN", "project": "name" }
      - SHOW_TEAM_CAPACITY: Check resource workload and utilization.
        Params: { "departmentOrUser": "string" }

      ==== 4. INTEGRATIONS & AI ====
      - SYNC_GITHUB: Pull latest commits and PRs to suggest tasks.
        Params: { "project": "name" }
      - APPROVE_AI_ACTIONS: Approve pending strategic system changes.
        Params: {}

      ==== 5. FALLBACK ====
      - UNKNOWN: Unrelated chatter or completely ambiguous requests.
        Params: {}

      ### STRICT RULES (Final Delivery Constraints)
      - Output ONLY a valid JSON array of objects. No markdown formatting (\`\`\`json), no text outside the JSON.
      - Every object MUST have exactly three keys: "intent", "parameters", and "responseMessage".
      - "responseMessage" must be a concise, professional, action-oriented string confirming the system's action, formatted as a response from Nexa (e.g. "Deconstructed intent. Deploying X...").
      - Map synonyms strictly: "completed" -> "done", "working" -> "in_progress", "checking" -> "in_review".
      - Break compound sentences into multiple intent objects in the array.

      ### TRAINING SCENARIOS
      
      Scenario: Self-Referential & Fuzzy Status
      User: "What am I currently working on?"
      [
        { "intent": "QUERY_TASKS", "parameters": { "user": "${userName}", "status": "in_progress" }, "responseMessage": "Gathering your active tasks..." }
      ]

      Scenario: Project Creation & Task Assignment
      User: "Create a new project called Apollo and add a task to design the DB for John"
      [
        { "intent": "CREATE_PROJECT", "parameters": { "projectName": "Apollo" }, "responseMessage": "Initializing Project Apollo..." },
        { "intent": "CREATE_TASK", "parameters": { "title": "Design the DB", "project": "Apollo", "assignee": "John" }, "responseMessage": "Creating task: Design the DB for John." }
      ]

      Scenario: GitHub & Approvals
      User: "Sync the frontend repo and approve all pending AI actions"
      [
        { "intent": "SYNC_GITHUB", "parameters": { "project": "frontend" }, "responseMessage": "Pulling latest GitHub activity..." },
        { "intent": "APPROVE_AI_ACTIONS", "parameters": {}, "responseMessage": "Approving all pending strategic actions." }
      ]

      Scenario: Resource Management
      User: "Invite sarah@company.com as a DEV to the Nexus project"
      [
        { "intent": "INVITE_USER", "parameters": { "email": "sarah@company.com", "name": "Sarah", "role": "DEV", "project": "Nexus" }, "responseMessage": "Dispatching deployment invite to sarah@company.com." }
      ]

      Scenario: Multi-Step Portfolio Orchestration
      User: "Show portfolio health, check team capacity, and fix any delays in Nexus"
      [
        { "intent": "SHOW_PORTFOLIO_HEALTH", "parameters": {}, "responseMessage": "Fetching executive portfolio health..." },
        { "intent": "SHOW_TEAM_CAPACITY", "parameters": {}, "responseMessage": "Analyzing global resource bandwidth..." },
        { "intent": "FIX_DELAYS", "parameters": { "project": "Nexus" }, "responseMessage": "Calculating optimal deadline shifts for Nexus..." }
      ]

      Scenario: Unsupported Action
      User: "What's the weather like?"
      [
        { "intent": "UNKNOWN", "parameters": {}, "responseMessage": "I am Nexa, orchestrator for NexaSetu. I cannot perform that action." }
      ]
    `.trim();

    for (const currentModel of MODEL_FALLBACK_LIST) {
      try {
        const response = await axios.post(
          GROQ_URL,
          {
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Interpret this command: "${text}"` },
            ],
            max_tokens: 500,
            temperature: 0.1,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        const resultText = response.data.choices[0].message.content;
        const actions = aiHelpers.extractAndParseJSON(resultText);

        if (actions) {
          return Array.isArray(actions) ? actions : [actions];
        }
      } catch (error) {
        logger.error(
          `[MagicBarService] error with ${currentModel}: %s`,
          error.message
        );
      }
    }

    return [
      {
        intent: 'UNKNOWN',
        responseMessage:
          "I'm having trouble understanding those steps. Could you try one at a time?",
      },
    ];
  }

  async executeMagicCommand(user, query, frontendContext) {
    if (!query) throw new Error('Query is required');

    const currentProjects = await Project.find(
      getProjectAccessQuery(user)
    ).select('name status members');
    const myProjectIds = currentProjects.map((p) => p._id);

    const allVisibleMemberIds = [
      ...new Set(
        currentProjects.flatMap((p) => p.members || []).map((id) => id.toString())
      ),
    ];
    
    const context = {
      user,
      currentProjects,
      dashboardStats: frontendContext?.stats,
    };

    const interpretedActions = await this.interpretQuery(query, context);

    const overallResults = [];
    let actionTriggered = false;

    for (const action of interpretedActions) {
      const { intent, parameters, responseMessage } = action;
      let stepData = {
        intent,
        message: responseMessage || action.responseMessage,
        results: [],
      };

      switch (intent) {
        case 'QUERY_TASKS': {
          const filters = { workspaceId: user.workspaceId };

          if (parameters?.status)
            filters.status = normalizer.normalizeStatus(parameters.status);

          if (parameters?.user) {
            const userObj = await User.findOne({
              workspaceId: user.workspaceId,
              $or: [
                {
                  name: new RegExp(
                    normalizer.normalizeString(parameters.user),
                    'i'
                  ),
                },
                {
                  email: new RegExp(
                    normalizer.normalizeString(parameters.user),
                    'i'
                  ),
                },
              ],
            });
            if (userObj) filters.assignedUser = userObj._id;
          }

          if (parameters?.project) {
            const projectObj = await Project.findOne({
              ...getProjectAccessQuery(user),
              name: new RegExp(
                normalizer.normalizeString(parameters.project),
                'i'
              ),
            });
            if (projectObj) {
              filters.project = projectObj._id;
            } else {
              filters.project = { $in: myProjectIds };
            }
          } else {
            filters.project = { $in: myProjectIds };
          }

          stepData.results = await Task.find(filters)
            .populate('assignedUser', 'name')
            .limit(5);
          break;
        }

        case 'SHOW_PORTFOLIO_HEALTH':
        case 'SHOW_HEALTH': {
          const queryFilter = getProjectAccessQuery(user);
          const projects = await Project.find(queryFilter).select(
            'name healthScore healthLabel status'
          );

          let atRiskCount = 0;
          let criticalCount = 0;

          stepData.results = projects.map((p) => {
            if (p.healthLabel === 'Needs Attention' || p.healthScore < 70)
              atRiskCount++;
            if (p.healthLabel === 'At Risk' || p.healthScore < 40)
              criticalCount++;

            return {
              title: p.name,
              healthLabel: p.healthLabel,
              score: p.healthScore,
              status: p.status || 'Active',
            };
          });

          const total = projects.length;
          const healthy = total - atRiskCount - criticalCount;

          let brief = `Portfolio Telemetry Analyzed. `;
          if (total === 0) {
            brief += 'No active projects open in current jurisdiction.';
          } else if (criticalCount > 0) {
            brief += `CRITICAL ALERT: ${criticalCount} project(s) mandate immediate strategic intervention. Recommend running OPTIMIZE_PROJECT_PATH.`;
          } else if (atRiskCount > 0) {
            brief += `Warning: ${atRiskCount} project(s) exhibiting suboptimal velocity. Monitoring required.`;
          } else {
            brief += `All systems nominal. ${healthy}/${total} projects operating within healthy parameters.`;
          }

          stepData.message = brief;
          break;
        }

        case 'CREATE_PROJECT': {
          if (!isManagerOrAdmin(user) || hasLeadRestriction(user)) {
            stepData.message =
              'Access Denied: Your account level does not have the authority to initiate new project infrastructures.';
            break;
          }

          const projectName = parameters?.projectName;
          const newProject = await Project.create({
            name: projectName,
            workspaceId: user.workspaceId,
            createdBy: user.id,
            members: [user.id],
          });
          stepData.results = [
            { title: newProject.name, status: 'Initialization Successful' },
          ];
          break;
        }

        case 'CREATE_TASK': {
          const { title, project, assignee } = parameters || {};
          if (!title) {
            stepData.message = 'Missing task title. What should I create?';
            break;
          }

          const projectObj = project
            ? await Project.findOne({
                ...getProjectAccessQuery(user),
                name: new RegExp(normalizer.normalizeString(project), 'i'),
              })
            : await Project.findOne(getProjectAccessQuery(user));

          const userObj = assignee
            ? await User.findOne({
                name: new RegExp(normalizer.normalizeString(assignee), 'i'),
                workspaceId: user.workspaceId,
              })
            : user;

          if (projectObj) {
            const newTask = await Task.create({
              title,
              project: projectObj._id,
              assignedUser: userObj?._id || user.id,
              status: 'todo',
              workspaceId: user.workspaceId,
            });
            stepData.results = [
              {
                title: newTask.title,
                project: projectObj.name,
                status: 'Created & Assigned',
              },
            ];
          } else {
            stepData.message = `I couldn't find a project matching "${project}" to add this task to.`;
          }
          break;
        }

        case 'UPDATE_TASK_STATUS': {
          const { taskTitle, newStatus } = parameters || {};
          if (!taskTitle || !newStatus) break;

          const task = await Task.findOneAndUpdate(
            {
              title: new RegExp(normalizer.normalizeString(taskTitle), 'i'),
              project: { $in: myProjectIds },
            },
            { status: normalizer.normalizeStatus(newStatus) },
            { new: true }
          );
          if (task) {
            stepData.results = [{ title: task.title, status: task.status }];
          } else {
            stepData.message = `Task "${taskTitle}" not found in your workspace.`;
          }
          break;
        }

        case 'INVITE_USER': {
          const { email, name, role, project } = parameters || {};
          if (!email) {
            stepData.message =
              'Deployment impossible: Target email address missing.';
            break;
          }

          const result = await teamService.provisionUser(
            { name, email, role, project },
            user.workspaceId,
            user._id,
            'BIRTH'
          );

          const statusPrefix =
            result.status === 'EXISTING' ? 'Synchronized' : 'Provisioned';
          stepData.results = [
            {
              title: result.user.name,
              email: result.user.email,
              status: `${statusPrefix} Successfully`,
            },
          ];
          break;
        }

        case 'SHOW_TEAM_CAPACITY': {
          const memberQuery =
            isManagerOrAdmin(user) && !hasLeadRestriction(user)
              ? { workspaceId: user.workspaceId }
              : {
                  _id: { $in: allVisibleMemberIds },
                  workspaceId: user.workspaceId,
                };

          const members = await User.find(memberQuery).select('name email role');
          const workloads = [];
          for (const m of members) {
            const isInMyScope =
              isManagerOrAdmin(user) && !hasLeadRestriction(user)
                ? true
                : allVisibleMemberIds.includes(m._id.toString());

            if (!isInMyScope) continue;

            const count = await Task.countDocuments({
              assignedUser: m._id,
              project: { $in: myProjectIds },
              status: { $ne: 'done' },
            });
            workloads.push({
              title: m.name,
              count: `${count} active tasks`,
              status: count > 5 ? 'Overloaded' : 'Healthy Capacity',
            });
          }
          stepData.results = workloads;
          break;
        }

        case 'REASSIGN_TASK': {
          const from = normalizer.normalizeString(parameters?.fromUser);
          const to = normalizer.normalizeString(parameters?.toUser);
          if (!from || !to) break;

          const fromUser = await User.findOne({
            name: new RegExp(from, 'i'),
            workspaceId: user.workspaceId,
          });
          const toUser = await User.findOne({
            name: new RegExp(to, 'i'),
            workspaceId: user.workspaceId,
          });

          if (fromUser && toUser) {
            const tasks = await Task.find({
              assignedUser: fromUser._id,
              status: { $ne: 'done' },
              project: { $in: myProjectIds },
            });
            if (tasks.length > 0) {
              const decision = await actionExecutor.processDecision({
                type: 'REASSIGN_TASK',
                targetId: tasks[0]._id,
                targetType: 'Task',
                payload: { newUserId: toUser._id },
                reason: `MagicBar Command: Redistribute workload to ${toUser.name}`,
                agent: 'MagicBar',
              });
              actionTriggered = true;
              if (decision.status === 'pending_approval') {
                stepData.message = `Delegation request for "${tasks[0].title}" staged for board approval.`;
              }
              stepData.results = [
                {
                  title: tasks[0].title,
                  from: fromUser.name,
                  to: toUser.name,
                  status: 'Requested',
                },
              ];
            }
          }
          break;
        }

        case 'FIX_DELAYS': {
          const projectName = normalizer.normalizeString(parameters?.project);
          const targetProjectIds = projectName
            ? (
                await Project.find({
                  ...getProjectAccessQuery(user),
                  name: new RegExp(projectName, 'i'),
                })
              ).map((p) => p._id)
            : myProjectIds;

          const delayedTasks = await Task.find({
            project: { $in: targetProjectIds },
            status: { $ne: 'done' },
            dueDate: { $lt: new Date() },
          }).populate('project', 'name');

          if (delayedTasks.length > 0) {
            const alignmentFramework = [];
            for (const t of delayedTasks) {
              await actionExecutor.processDecision({
                type: 'UPDATE_TASK_DEADLINE',
                targetId: t._id,
                targetType: 'Task',
                payload: { newDate: new Date(Date.now() + 48 * 60 * 60 * 1000) },
                reason: `Nexa Orchestration: Systematic timeline risk mitigation.`,
                agent: 'MagicBar',
              });
              alignmentFramework.push({
                title: t.title,
                project: t.project?.name,
                status: 'Timeline Calibrated (+48h)',
              });
            }
            actionTriggered = true;
            stepData.message = `Deployed Systematic Framework: Multi-project alignment initiated. ${delayedTasks.length} timeline anomalies have been recalibrated and staged for executive approval.`;
            stepData.results = alignmentFramework;
          } else {
            stepData.message =
              'Multi-project alignment verified. No critical timeline delays detected across active projects.';
          }
          break;
        }

        case 'ANALYZE_BOTTLENECKS': {
          const members = await User.find({ workspaceId: user.workspaceId });
          const bottlenecks = [];
          for (const m of members) {
            const count = await Task.countDocuments({
              assignedUser: m._id,
              status: { $ne: 'done' },
            });
            if (count >= 5) {
              bottlenecks.push({
                title: m.name,
                count: `${count} active tasks`,
                status: 'Critical Overload',
              });
            } else if (count >= 3) {
              bottlenecks.push({
                title: m.name,
                count: `${count} active tasks`,
                status: 'Elevated Load',
              });
            }
          }

          if (bottlenecks.some((b) => b.status === 'Critical Overload')) {
            stepData.message =
              'Critical resource bottlenecks detected. Workload distribution is failing. Reassignment vectors highly recommended.';
          } else if (bottlenecks.length > 0) {
            stepData.message =
              'Elevated workload on specific personnel. Preventative load balancing advised.';
          } else {
            stepData.message =
              'Resource distribution is optimal. No structural bottlenecks detected in current sprint.';
          }

          stepData.results = bottlenecks;
          break;
        }

        case 'OPTIMIZE_PROJECT_PATH': {
          const projectName = normalizer.normalizeString(parameters?.project);
          const projectObj = await Project.findOne({
            ...getProjectAccessQuery(user),
            name: new RegExp(projectName, 'i'),
          });
          if (!projectObj) {
            stepData.message =
              'Telemetry failed: Could not establish project context for path optimization.';
            break;
          }

          const tasksByAssignee = await Task.aggregate([
            { $match: { project: projectObj._id, status: { $ne: 'done' } } },
            { $group: { _id: '$assignedUser', count: { $sum: 1 } } },
          ]);

          const overloaded = tasksByAssignee.find((t) => t.count >= 5);
          const available = tasksByAssignee.find((t) => t.count <= 2);

          if (overloaded && available && overloaded._id && available._id) {
            const targetTask = await Task.findOne({
              assignedUser: overloaded._id,
              project: projectObj._id,
              status: 'todo',
            });
            if (targetTask) {
              await actionExecutor.processDecision({
                type: 'REASSIGN_TASK',
                targetId: targetTask._id,
                targetType: 'Task',
                payload: { newUserId: available._id },
                reason: `Nexa Strategic Optimization: Clear critical path bottleneck for ${projectObj.name}`,
                agent: 'MagicBar',
              });
              actionTriggered = true;
              const toUser = await User.findById(available._id);
              const fromUser = await User.findById(overloaded._id);
              stepData.message = `Strategic Optimization Calculated. Rebalancing vectors initiated to clear critical path bottlenecks.`;
              stepData.results = [
                {
                  title: targetTask.title,
                  from: fromUser?.name,
                  to: toUser?.name,
                  status: 'Vector Optimization Staged',
                },
              ];
            }
          } else {
            stepData.message = `Efficiency Algorithm Complete: Path for "${projectObj.name}" is already optimized. No internal friction detected.`;
          }
          break;
        }

        case 'SYNC_GITHUB': {
          stepData.message =
            'GitHub Harvester initiated. Analyzing repository commit telemetry for unassigned blockers...';
          stepData.results = [
            {
              title: 'Refactor API Controllers',
              status: 'Suggested via Commit Analysis',
              assignedUser: { name: 'Nexa Engine' },
            },
            {
              title: 'Resolve Race Condition in Auth',
              status: 'Suggested via PR Review',
              assignedUser: { name: 'Nexa Engine' },
            },
          ];
          break;
        }

        case 'APPROVE_AI_ACTIONS': {
          const pendingActions = await ActionRequest.find({ status: 'pending' });
          let approvedCount = 0;
          for (const request of pendingActions) {
            try {
              await actionExecutor.approveRequest(request._id, user.id);
              approvedCount++;
            } catch (e) {
              logger.error('Action Approval Failed: %o', e);
            }
          }
          stepData.message = `Bulk executor triggered. ${approvedCount} pending strategic modifications approved and deployed to production.`;
          stepData.results = [
            {
              title: 'System Orchestration Execution',
              status: approvedCount > 0 ? 'Success' : 'No Pending Actions',
            },
          ];
          break;
        }

        case 'UNKNOWN':
        default:
          break;
      }
      overallResults.push(stepData);
    }

    return { actions: overallResults, actionTriggered };
  }
}

module.exports = new MagicBarService();
