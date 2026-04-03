const { Octokit } = require('octokit');
const aiService = require('./aiService');
const Task = require('../models/Task');

// Facilitates direct telemetry extraction and synchronization from linked GitHub repositories.

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

exports.getRepositoryActivity = async (accessToken, owner, repo) => {
  const octokit = exports.getOctokit(accessToken);

  let commits = [];
  try {
    // Extract the latest commit history chunks.
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 20,
    });
    commits = data;
  } catch (err) {
    // Suppress errors gracefully for uninitialized workspaces.
  }

  let prs = [];
  try {
    // Query active and historical pull request metadata.
    const { data } = await octokit.rest.repos.listPullRequests({
      owner,
      repo,
      state: 'all',
      per_page: 20,
    });
    prs = data;
  } catch (err) {
    // Fallback silently if PR queries fail against the repository.
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

  // Implement batch lookup vectors to eliminate iterative N+1 query bottlenecks.
  const existingGithubIds = await Task.find({
    githubId: { $in: activity.map((a) => a.id) },
    project: projectId,
  }).distinct('githubId');

  const existingIdsSet = new Set(existingGithubIds);
  const resourceService = require('./resourceService');

  for (const item of activity) {
    // Update internal systems mapping to hardcoded GitHub reference numbers.
    // Parse commit bodies for automated resolution keywords.
    const taskRefs = item.message.match(/(?:Fixes|Closes|Resolves)\s#(\d+)/gi);
    if (taskRefs) {
      for (const ref of taskRefs) {
        const taskNum = parseInt(ref.split('#')[1]);
        const task = await Task.findOne({
          project: projectId,
          taskNumber: taskNum,
        });

        if (task && task.status !== 'done') {
          // Translate external closure structures directly into system statuses.
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

    // Ignore deduplicated structural nodes preventing duplicate task generation.
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

      // Deploy subsequent algorithmic evaluations for intelligent routing.
      await resourceService.autoAssignTask(suggestedTask._id);

      suggestions.push(suggestedTask);
    } catch (error) {
      // Tolerate generative processing failures cleanly.
    }
  }

  return suggestions;
};
