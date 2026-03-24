const { Octokit } = require('octokit');
const aiService = require('./aiService');
const Task = require('../models/Task');

/**
 * GitHub Service for interacting with GitHub API and processing activity
 */

exports.getOctokit = (accessToken) => {
  return new Octokit({ auth: accessToken });
};

/**
 * Fetches user repositories
 */
exports.getUserRepositories = async (accessToken) => {
  const octokit = exports.getOctokit(accessToken);
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 50,
  });
  return data.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
    url: repo.html_url
  }));
};

/**
 * Fetches recent activity (commits and PRs) from a repository
 */
exports.getRepositoryActivity = async (accessToken, owner, repo) => {
  const octokit = exports.getOctokit(accessToken);
  
  let commits = [];
  try {
    // Fetch recent commits (last 20)
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 20,
    });
    commits = data;
  } catch (err) {
    // Continue with empty commits if repo is empty (409) or not found (404)
  }

  let prs = [];
  try {
    // Fetch recent PRs (last 20)
    const { data } = await octokit.rest.repos.listPullRequests({
      owner,
      repo,
      state: 'all',
      per_page: 20,
    });
    prs = data;
  } catch (err) {
    // Skip PRs on error
  }

  const activity = [
    ...commits.map(c => ({
      id: c.sha,
      type: 'commit',
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    })),
    ...prs.map(p => ({
      id: p.id.toString(),
      type: 'pull_request',
      message: `${p.title}: ${p.body || ''}`,
      author: p.user.login,
      date: p.created_at,
      url: p.html_url,
      status: p.state,
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return activity;
};

/**
 * Uses AI to suggest tasks from activity data
 */
exports.generateTaskSuggestions = async (activity, projectId) => {
  const suggestions = [];
  
  // Performance Optimization: Batch query existing tasks for this project
  const existingGithubIds = await Task.find({ 
    githubId: { $in: activity.map(a => a.id) }, 
    project: projectId 
  }).distinct('githubId');

  const existingIdsSet = new Set(existingGithubIds);

  for (const item of activity) {
    // Skip if this activity item has already been converted to a task
    if (existingIdsSet.has(item.id)) continue;

    try {
      const extractedTask = await aiService.extractTaskFromText(item.message);
      
      suggestions.push({
        ...extractedTask,
        githubId: item.id,
        githubUrl: item.url,
        type: item.type,
        originalMessage: item.message,
        author: item.author
      });
    } catch (error) {
      // Skip failed AI extractions
    }
  }

  return suggestions;
};
