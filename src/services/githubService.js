const { Octokit } = require('octokit');
const aiService = require('./aiService');
const Task = require('../models/Task');

// Service for GitHub repository synchronization and task extraction.

exports.getOctokit = (accessToken) => {
  return new Octokit({ auth: accessToken });
};

exports.getUserRepositories = async (accessToken) => {
  const octokit = exports.getOctokit(accessToken);
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 50,
  });
  return data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
    url: repo.html_url,
  }));
};

// Retry wrapper for handling transient API errors and rate limits.
const retry = async (fn, retries = 2, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || (error.status && error.status < 500 && error.status !== 429)) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
};

exports.getRepositoryActivity = async (accessToken, owner, repo) => {
  const octokit = exports.getOctokit(accessToken);

  let commits = [];
  try {
    // Fetch latest commits with retry logic.
    const { data } = await retry(() => octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 20,
    }));
    commits = data;
  } catch (err) {
    console.warn(`[GITHUB RECON] Commits unreachable for ${owner}/${repo}:`, err.message);
  }

  let prs = [];
  try {
    // Fetch pull requests with retry logic.
    const { data } = await retry(() => octokit.rest.repos.listPullRequests({
      owner,
      repo,
      state: 'all',
      per_page: 20,
    }));
    prs = data;
  } catch (err) {
    console.warn(`[GITHUB RECON] PRs unreachable for ${owner}/${repo}:`, err.message);
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

exports.generateTaskSuggestions = async (activity, projectId) => {
  const suggestions = [];

  // Batch lookup existing tasks to prevent N+1 overhead.
  const existingGithubIds = await Task.find({
    githubId: { $in: activity.map((a) => a.id) },
    project: projectId,
  }).distinct('githubId');

  const existingIdsSet = new Set(existingGithubIds);
  const resourceService = require('./resourceService');

  for (const item of activity) {
    // Parse commit messages for task resolution keywords (e.g., Fixes #123).
    const taskRefs = item.message.match(/(?:Fixes|Closes|Resolves)\s#(\d+)/gi);
    if (taskRefs) {
      for (const ref of taskRefs) {
        const taskNum = parseInt(ref.split('#')[1]);
        const task = await Task.findOne({
          project: projectId,
          taskNumber: taskNum,
        });

        if (task && task.status !== 'done') {
          // Map GitHub status to internal task status.
          if (item.type === 'pull_request' && item.status === 'closed') {
            task.status = 'done';
            task.completedAt = new Date();
          } else if (item.type === 'pull_request') {
            task.status = 'in_review';
          } else {
            // Transition underlying system units to an active operational state.
            task.status = 'in_progress';
          }
          await task.save();
        }
      }
    }

    // Skip if the task already exists.
    if (existingIdsSet.has(item.id)) continue;

    try {
      const extractedTask = await aiService.extractTaskFromText(item.message);

      const suggestedTask = await Task.create({
        ...extractedTask,
        project: projectId,
        githubId: item.id,
        githubUrl: item.url,
        source: 'github',
        isAiGenerated: true,
      });

      // Automatically assign the new task using resource logic.
      await resourceService.autoAssignTask(suggestedTask._id);

      suggestions.push(suggestedTask);
    } catch (error) {
      // Tolerate generative processing failures cleanly.
    }
  }

  return suggestions;
};
