const githubService = require('../services/githubService');

exports.connectGithub = async (req, res) => {
  try {
    const data = await githubService.connectGithub(
      req.user,
      req.body.accessToken
    );
    res.status(200).json({
      status: 'success',
      message: 'GitHub account connected to workspace successfully',
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: error.message,
    });
  }
};

exports.getRepositories = async (req, res) => {
  try {
    const data = await githubService.getUserRepositories(req.user);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: error.message,
    });
  }
};

exports.linkProject = async (req, res) => {
  try {
    const project = await githubService.linkProject(
      req.user,
      req.body.projectId,
      req.body.repoInfo
    );
    res.status(200).json({
      status: 'success',
      message: 'Project linked to GitHub successfully',
      data: project,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: error.message,
    });
  }
};

exports.getActivitySuggestions = async (req, res) => {
  try {
    const data = await githubService.getActivitySuggestions(
      req.user,
      req.params.projectId
    );
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: error.message,
    });
  }
};

exports.approveTasks = async (req, res) => {
  try {
    const createdTasks = await githubService.approveTasks(
      req.user,
      req.body.projectId,
      req.body.tasks
    );
    res.status(201).json({
      status: 'success',
      message: `${createdTasks.length} tasks created successfully`,
      data: createdTasks,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode >= 500 ? 'error' : 'fail',
      message: error.message,
    });
  }
};
