const express = require('express');
const githubController = require('../controllers/githubController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/connect', githubController.connectGithub);
router.get('/repositories', githubController.getRepositories);
router.post('/link-project', githubController.linkProject);
router.get('/activity-suggestions/:projectId', githubController.getActivitySuggestions);
router.post('/approve-tasks', githubController.approveTasks);

module.exports = router;
