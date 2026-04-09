const githubService = require('../services/githubService');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { encrypt } = require('../utils/crypto');

// Integrates with GitHub to sync repositories, extract activity insights, and generate task suggestions.
// Connects a user's GitHub account and securely stores their credentials.
exports.connectGithub = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res
        .status(400)
        .json({ status: 'fail', message: 'GitHub Access Token is required' });
    }

    // Optional: Fetch GitHub User ID using the token for better tracking
    const octokit = githubService.getOctokit(accessToken);
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();

    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(
      req.user.workspaceId,
      {
        'integrations.github.connected': true,
        'integrations.github.accessToken': encrypt(accessToken),
        'integrations.github.githubId': githubUser.id.toString(),
        'integrations.github.lastSync': new Date()
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'GitHub account connected to workspace successfully',
      data: {
        githubId: githubUser.id,
        githubUsername: githubUser.login,
      },
    });
  } catch (error) {
    console.error('[GitHub Connection Error]:', error.message);
    
    // Handle specific GitHub API errors
    const statusCode = error.status || (error.response && error.response.status);
    
    if (statusCode === 401) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid Personal Access Token. Please check your token and try again.'
      });
    }

    if (statusCode === 403) {
      return res.status(403).json({
        status: 'fail',
        message: 'Insufficient permissions or rate limited. Ensure your token has the required scopes.'
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        status: 'fail',
        message: 'This GitHub account is already linked to another workspace.'
      });
    }

    res.status(statusCode || 500).json({ 
      status: 'error', 
      message: error.message || 'Failed to connect GitHub account. Please verify your network and token.' 
    });
  }
};

// Retrieves the authenticated user's remote repositories from GitHub.
exports.getRepositories = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.githubAccessToken) {
      return res
        .status(400)
        .json({ status: 'fail', message: 'GitHub not connected' });
    }

    const repos = await githubService.getUserRepositories(
      user.githubAccessToken
    );
    res.status(200).json({
      status: 'success',
      data: repos,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: 'error', message: 'Failed to fetch repositories' });
  }
};

// Links a specific NexaSetu project with a remote GitHub repository.
exports.linkProject = async (req, res) => {
  try {
    const { projectId, repoInfo } = req.body; // repoInfo contains owner, repo, fullName
    if (!projectId || !repoInfo) {
      return res
        .status(400)
        .json({
          status: 'fail',
          message: 'Project ID and Repository info are required',
        });
    }

    const isAdminOrManager =
      req.user.role === 'WORKSPACE_ADMIN' ||
      req.user.role === 'WORKSPACE_MANAGER' ||
      req.user.role === 'ADMIN' ||
      req.user.role === 'MANAGER';

    const filter = { _id: projectId, workspaceId: req.user.workspaceId };
    if (!isAdminOrManager) {
      filter.createdBy = req.user._id;
    }

    const project = await Project.findOneAndUpdate(
      filter,
      { githubRepo: repoInfo },
      { returnDocument: 'after' }
    );

    if (!project) {
      return res
        .status(404)
        .json({
          status: 'fail',
          message: 'Project not found or not authorized',
        });
    }

    res.status(200).json({
      status: 'success',
      message: 'Project linked to GitHub successfully',
      data: project,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: 'error', message: 'Failed to link project' });
  }
};

// Analyzes recent repository activity to generate AI-driven task suggestions.
exports.getActivitySuggestions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const isAdminOrManager =
      req.user.role === 'WORKSPACE_ADMIN' ||
      req.user.role === 'WORKSPACE_MANAGER' ||
      req.user.role === 'ADMIN' ||
      req.user.role === 'MANAGER';

    // Security: Ensure project exists and user is a member OR an admin in the workspace
    const projectFilter = { _id: projectId, workspaceId: req.user.workspaceId };
    if (!isAdminOrManager) {
      projectFilter.members = req.user._id;
    }

    const project = await Project.findOne(projectFilter);

    if (!project || !project.githubRepo) {
      return res
        .status(403)
        .json({
          status: 'fail',
          message: 'Project not found, not linked to GitHub, or access denied',
        });
    }

    const user = await User.findById(req.user._id);
    if (!user.githubAccessToken) {
      return res
        .status(400)
        .json({ status: 'fail', message: 'GitHub not connected' });
    }

    const activity = await githubService.getRepositoryActivity(
      user.githubAccessToken,
      project.githubRepo.owner,
      project.githubRepo.repo
    );

    for (const item of activity) {
      AgentOrchestrator.handleEvent({
        type: 'GITHUB_ACTIVITY',
        project: projectId,
        user: req.user._id,
        entityId: item.nodeId,
        entityType: 'github_event',
        payload: {
          projectId,
          githubId: item.nodeId,
          type: item.type,
          message: item.message,
          author: item.author,
          statusHint: item.type === 'commit' ? 'done' : 'in_progress',
        },
      }).catch((err) => {
        console.error(
          `[AgentOrchestrator Error] Failed to handle GitHub activity ${item.nodeId}:`,
          err.message
        );
      });
    }

    const suggestions = await githubService.generateTaskSuggestions(
      activity,
      projectId
    );

    res.status(200).json({
      status: 'success',
      data: suggestions,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        status: 'error',
        message: 'Failed to fetch activity suggestions',
      });
  }
};

// Processes a batch of AI suggestions and imports them as formal tasks into the project.
exports.approveTasks = async (req, res) => {
  try {
    const { projectId, tasks } = req.body;
    if (!projectId || !tasks || !Array.isArray(tasks)) {
      return res
        .status(400)
        .json({
          status: 'fail',
          message: 'Project ID and tasks array are required',
        });
    }

    const isAdminOrManager =
      req.user.role === 'WORKSPACE_ADMIN' ||
      req.user.role === 'WORKSPACE_MANAGER' ||
      req.user.role === 'ADMIN' ||
      req.user.role === 'MANAGER';
    const projectFilter = { _id: projectId, workspaceId: req.user.workspaceId };
    if (!isAdminOrManager) {
      projectFilter.members = req.user._id;
    }

    const project = await Project.findOne(projectFilter);
    if (!project) {
      return res
        .status(403)
        .json({ status: 'fail', message: 'Access denied to this project' });
    }

    // Performance Optimization: Batch check for duplicates
    const existingGithubIds = await Task.find({
      githubId: {
        $in: tasks.filter((t) => t && t.githubId).map((t) => t.githubId),
      },
      project: projectId,
    }).distinct('githubId');

    const existingSet = new Set(existingGithubIds);

    const tasksToCreate = tasks
      .filter((t) => t && t.githubId && !existingSet.has(t.githubId))
      .map((t) => ({
        title: t.title,
        description:
          t.description ||
          `Imported from GitHub ${t.type}: ${t.originalMessage}`,
        project: projectId,
        status: t.status,
        source: 'github',
        githubId: t.githubId,
        assignedUser: req.user._id,
        createdBy: req.user._id,
      }));

    let createdTasks = [];
    if (tasksToCreate.length > 0) {
      createdTasks = await Task.insertMany(tasksToCreate);
    }

    res.status(201).json({
      status: 'success',
      message: `${createdTasks.length} tasks created successfully`,
      data: createdTasks,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: 'error', message: 'Failed to approve tasks' });
  }
};
