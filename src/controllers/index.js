// Centralized barrel export proxy for all controller logic endpoints.
const authController = require('./authController');
const projectController = require('./projectController');
const taskController = require('./taskController');
const sprintController = require('./sprintController');
const teamController = require('./teamController');
const dashboardController = require('./dashboardController');
const githubController = require('./githubController');
const aiController = require('./aiController');
const magicBarController = require('./magicBarController');
const actionController = require('./actionController');
const aiActivityController = require('./aiActivityController');
const aiRecommendationController = require('./aiRecommendationController');
const resourceController = require('./resourceController');
const sprintStatsController = require('./sprintStatsController');

module.exports = {
  authController,
  projectController,
  taskController,
  sprintController,
  teamController,
  dashboardController,
  githubController,
  aiController,
  magicBarController,
  actionController,
  aiActivityController,
  aiRecommendationController,
  resourceController,
  sprintStatsController,
};
