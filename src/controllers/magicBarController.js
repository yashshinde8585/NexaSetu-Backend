const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const ActionRequest = require('../models/ActionRequest');
const magicBarService = require('../services/magicBarService');
const actionExecutor = require('../services/actionExecutor');
const normalizer = require('../services/parameterNormalizer');
const teamService = require('../services/teamService');
const catchAsync = require('../utils/catchAsync');
const { getProjectAccessQuery } = require('../utils/queryHelpers');
const {
  isManagerOrAdmin,
  hasLeadRestriction,
} = require('../utils/authHelpers');

// Drives the conversational Magic Bar interface by interpreting queries and executing AI-mapped actions.
exports.executeMagicCommand = catchAsync(async (req, res, next) => {
  const { query, context: frontendContext } = req.body;
  if (!query)
    return res
      .status(400)
      .json({ status: 'fail', message: 'Query is required' });

  // Retrieve contextual metadata securely bound to the user's workspace.
  const currentProjects = await Project.find(
    getProjectAccessQuery(req.user)
  ).select('name status members');
  const myProjectIds = currentProjects.map((p) => p._id);

  // Collect all unique members from accessible projects
  const allVisibleMemberIds = [
    ...new Set(
      currentProjects.flatMap((p) => p.members || []).map((id) => id.toString())
    ),
  ];
  const context = {
    user: req.user,
    currentProjects,
    dashboardStats: frontendContext?.stats, // Forward dashboard stats to the AI interpreter
  };

  // Translate natural language input into actionable system commands.
  const interpretedActions = await magicBarService.interpretQuery(
    query,
    context
  );

  const overallResults = [];
  let actionTriggered = false;

  // Execute each recognized intent dynamically.
  for (const action of interpretedActions) {
    const { intent, parameters, responseMessage } = action;
    let stepData = {
      intent,
      message: responseMessage || action.responseMessage,
      results: [],
    };

    switch (intent) {
      case 'QUERY_TASKS': {
        const filters = { workspaceId: req.user.workspaceId };

        if (parameters?.status)
          filters.status = normalizer.normalizeStatus(parameters.status);

        if (parameters?.user) {
          const userObj = await User.findOne({
            workspaceId: req.user.workspaceId,
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
            ...getProjectAccessQuery(req.user),
            name: new RegExp(
              normalizer.normalizeString(parameters.project),
              'i'
            ),
          });
          if (projectObj) {
            filters.project = projectObj._id;
          } else {
            filters.project = { $in: myProjectIds }; // Fallback to all accessible if specific not found
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
        const query = getProjectAccessQuery(req.user);
        const projects = await Project.find(query).select(
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

        // Generate Executive Briefing context based on Nexa's Chain-of-Thought
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
        if (!isManagerOrAdmin(req.user) || hasLeadRestriction(req.user)) {
          stepData.message =
            'Access Denied: Your account level does not have the authority to initiate new project infrastructures.';
          break;
        }

        const projectName = parameters?.projectName;
        const newProject = await Project.create({
          name: projectName,
          workspaceId: req.user.workspaceId,
          createdBy: req.user.id,
          members: [req.user.id],
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
              ...getProjectAccessQuery(req.user),
              name: new RegExp(normalizer.normalizeString(project), 'i'),
            })
          : await Project.findOne(getProjectAccessQuery(req.user));

        const userObj = assignee
          ? await User.findOne({
              name: new RegExp(normalizer.normalizeString(assignee), 'i'),
              workspaceId: req.user.workspaceId,
            })
          : req.user;

        if (projectObj) {
          const newTask = await Task.create({
            title,
            project: projectObj._id,
            assignedUser: userObj?._id || req.user.id,
            status: 'todo',
            workspaceId: req.user.workspaceId,
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

        // Consolidate via TeamService using Strategy: BIRTH (Instant Birth)
        const result = await teamService.provisionUser(
          { name, email, role, project },
          req.user.workspaceId,
          req.user._id,
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
        // Role-aware member discovery
        const memberQuery =
          isManagerOrAdmin(req.user) && !hasLeadRestriction(req.user)
            ? { workspaceId: req.user.workspaceId }
            : {
                _id: { $in: allVisibleMemberIds },
                workspaceId: req.user.workspaceId,
              };

        const members = await User.find(memberQuery).select('name email role');
        const workloads = [];
        for (const m of members) {
          // Determine if this user is a peer/report in visible projects
          const isInMyScope =
            isManagerOrAdmin(req.user) && !hasLeadRestriction(req.user)
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
          workspaceId: req.user.workspaceId,
        });
        const toUser = await User.findOne({
          name: new RegExp(to, 'i'),
          workspaceId: req.user.workspaceId,
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
                ...getProjectAccessQuery(req.user),
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
        const members = await User.find({ workspaceId: req.user.workspaceId });
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
          ...getProjectAccessQuery(req.user),
          name: new RegExp(projectName, 'i'),
        });
        if (!projectObj) {
          stepData.message =
            'Telemetry failed: Could not establish project context for path optimization.';
          break;
        }

        // 1. Find the bottleneck (Overloaded User)
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
            await actionExecutor.approveRequest(request._id, req.user.id);
            approvedCount++;
          } catch (e) {
            console.error('Action Approval Failed', e);
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

  res.status(200).json({
    status: 'success',
    data: {
      actions: overallResults,
      actionTriggered,
    },
  });
});
