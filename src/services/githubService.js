const { Octokit } = require('octokit');
const aiService = require('./aiService');
const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Workspace = require('../models/Workspace');
const AgentOrchestrator = require('../services/agentOrchestrator');
const { encrypt, decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');
const AppError = require('../utils/appError');
const CircuitBreaker = require('../utils/circuitBreaker');

const githubBreaker = new CircuitBreaker('GitHub_API', { failureThreshold: 3, resetTimeout: 30000 });

const getOctokit = (accessToken) => {
  const token = accessToken.includes(':') ? decrypt(accessToken) : accessToken;
  return new Octokit({ auth: token });
};

const connectGithub = async (user, accessToken) => {
  if (!accessToken) {
    throw new AppError('GitHub Access Token is required', 400);
  }

  try {
    const octokit = getOctokit(accessToken);
    const { data: githubUser } = await githubBreaker.execute(() => octokit.rest.users.getAuthenticated());

    await Workspace.findByIdAndUpdate(
      user.workspaceId,
      {
        'integrations.github.connected': true,
        'integrations.github.accessToken': encrypt(accessToken),
        'integrations.github.githubId': githubUser.id.toString(),
        'integrations.github.lastSync': new Date()
      }
    );

    return {
      githubId: githubUser.id,
      githubUsername: githubUser.login,
    };
  } catch (error) {
    logger.error('[GitHub Connection Error]: %s', error.message);
    const statusCode = error.status || (error.response && error.response.status);
    
    if (statusCode === 401) {
      throw new AppError('Invalid Personal Access Token. Please check your token and try again.', 401);
    }
    if (statusCode === 403) {
      throw new AppError('Insufficient permissions or rate limited. Ensure your token has the required scopes.', 403);
    }
    if (error.code === 11000) {
      throw new AppError('This GitHub account is already linked to another workspace.', 409);
    }

    throw new AppError(error.message || 'Failed to connect GitHub account. Please verify your network and token.', statusCode || 500);
  }
};

const getUserRepositories = async (user) => {
  const userDoc = await User.findById(user._id);
  if (!userDoc.githubAccessToken) {
    throw new AppError('GitHub not connected', 400);
  }

  const octokit = getOctokit(userDoc.githubAccessToken);
  const { data } = await githubBreaker.execute(() => octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 50,
  }), () => { throw new AppError('GitHub API is temporarily unavailable', 503); });
  return data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
    url: repo.html_url,
  }));
};

const linkProject = async (user, projectId, repoInfo) => {
  if (!projectId || !repoInfo) {
    throw new AppError('Project ID and Repository info are required', 400);
  }

  const isAdminOrManager = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'ADMIN', 'MANAGER'].includes(user.role);

  const filter = { _id: projectId, workspaceId: user.workspaceId };
  if (!isAdminOrManager) {
    filter.createdBy = user._id;
  }

  const project = await Project.findOneAndUpdate(
    filter,
    { githubRepo: repoInfo },
    { returnDocument: 'after' }
  );

  if (!project) {
    throw new AppError('Project not found or not authorized', 404);
  }

  return project;
};

const getRepositoryActivity = async (accessToken, owner, repo) => {
  const octokit = getOctokit(accessToken);

  const retry = async (fn, retries = 2, delay = 1000) => {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0 || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay * 2);
    }
  };

  let commits = [];
  try {
    const { data } = await githubBreaker.execute(() => retry(() => octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 20,
    })));
    commits = data;
  } catch (err) {
    logger.warn(`[GITHUB RECON] Commits unreachable for ${owner}/${repo}: %s`, err.message);
  }

  let prs = [];
  try {
    const { data } = await githubBreaker.execute(() => retry(() => octokit.rest.repos.listPullRequests({
      owner,
      repo,
      state: 'all',
      per_page: 20,
    })));
    prs = data;
  } catch (err) {
    logger.warn(`[GITHUB RECON] PRs unreachable for ${owner}/${repo}: %s`, err.message);
  }

  const activity = [
    ...commits.map((c) => ({
      id: c.sha,
      type: 'commit',
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    })),
    ...prs.map((p) => ({
      id: p.id.toString(),
      type: 'pull_request',
      message: `${p.title}: ${p.body || ''}`,
      author: p.user.login,
      date: p.created_at,
      url: p.html_url,
      status: p.state,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return activity;
};

const generateTaskSuggestions = async (activity, projectId) => {
  const suggestions = [];

  const existingGithubIds = await Task.find({
    githubId: { $in: activity.map((a) => a.id) },
    project: projectId,
  }).distinct('githubId');

  const existingIdsSet = new Set(existingGithubIds);
  const resourceService = require('./resourceService');

  for (const item of activity) {
    const taskRefs = item.message.match(/(?:Fixes|Closes|Resolves)\s#(\d+)/gi);
    if (taskRefs) {
      for (const ref of taskRefs) {
        const taskNum = parseInt(ref.split('#')[1]);
        const task = await Task.findOne({
          project: projectId,
          taskNumber: taskNum,
        });

        if (task && task.status !== 'done') {
          if (item.type === 'pull_request' && item.status === 'closed') {
            task.status = 'done';
            task.completedAt = new Date();
          } else if (item.type === 'pull_request') {
            task.status = 'in_review';
          } else {
            task.status = 'in_progress';
          }
          await task.save();
        }
      }
    }

    if (existingIdsSet.has(item.id)) continue;

    suggestions.push(item);
  }

  const taskCreations = await Promise.all(
    suggestions.map(async (item) => {
      try {
        const extractedTask = await aiService.extractTaskFromText(item.message);
        return {
          ...extractedTask,
          project: projectId,
          githubId: item.id,
          githubUrl: item.url,
          source: 'github',
          isAiGenerated: true,
        };
      } catch (error) {
        logger.error(`AI Task Extraction failed for item ${item.id}: ${error.message}`);
        return null;
      }
    })
  );

  const filteredTasks = taskCreations.filter((t) => t !== null);
  
  if (filteredTasks.length > 0) {
    const createdTasks = await Task.insertMany(filteredTasks);
    
    for (const task of createdTasks) {
      resourceService.autoAssignTask(task._id).catch(err => 
        logger.warn(`Auto-assignment failed for task ${task._id}: ${err.message}`)
      );
    }
    return createdTasks;
  }

  return [];
};

const getActivitySuggestions = async (user, projectId) => {
  const isAdminOrManager = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'ADMIN', 'MANAGER'].includes(user.role);

  const projectFilter = { _id: projectId, workspaceId: user.workspaceId };
  if (!isAdminOrManager) {
    projectFilter.members = user._id;
  }

  const project = await Project.findOne(projectFilter);

  if (!project || !project.githubRepo) {
    throw new AppError('Project not found, not linked to GitHub, or access denied', 403);
  }

  const userDoc = await User.findById(user._id);
  if (!userDoc.githubAccessToken) {
    throw new AppError('GitHub not connected', 400);
  }

  const activity = await getRepositoryActivity(
    userDoc.githubAccessToken,
    project.githubRepo.owner,
    project.githubRepo.repo
  );

  for (const item of activity) {
    AgentOrchestrator.handleEvent({
      type: 'GITHUB_ACTIVITY',
      project: projectId,
      user: user._id,
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
      logger.error(
        `[AgentOrchestrator Error] Failed to handle GitHub activity ${item.nodeId}: %s`,
        err.message
      );
    });
  }

  return await generateTaskSuggestions(activity, projectId);
};

const approveTasks = async (user, projectId, tasks) => {
  if (!projectId || !tasks || !Array.isArray(tasks)) {
    throw new AppError('Project ID and tasks array are required', 400);
  }

  const isAdminOrManager = ['WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'ADMIN', 'MANAGER'].includes(user.role);
  const projectFilter = { _id: projectId, workspaceId: user.workspaceId };
  if (!isAdminOrManager) {
    projectFilter.members = user._id;
  }

  const project = await Project.findOne(projectFilter);
  if (!project) {
    throw new AppError('Access denied to this project', 403);
  }

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
      description: t.description || `Imported from GitHub ${t.type}: ${t.originalMessage}`,
      project: projectId,
      status: t.status,
      source: 'github',
      githubId: t.githubId,
      assignedUser: user._id,
      createdBy: user._id,
    }));

  let createdTasks = [];
  if (tasksToCreate.length > 0) {
    createdTasks = await Task.insertMany(tasksToCreate);
  }

  return createdTasks;
};

module.exports = {
  getOctokit,
  connectGithub,
  getUserRepositories,
  linkProject,
  getActivitySuggestions,
  getRepositoryActivity,
  generateTaskSuggestions,
  approveTasks,
};
