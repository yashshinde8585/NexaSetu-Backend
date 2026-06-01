const express = require('express');
const githubController = require('../controllers/githubController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /github/connect:
 *   post:
 *     summary: Auto-generated summary for POST /github/connect
 *     tags: [Github]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/connect', githubController.connectGithub);
/**
 * @swagger
 * /github/repositories:
 *   get:
 *     summary: Auto-generated summary for GET /github/repositories
 *     tags: [Github]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/repositories', githubController.getRepositories);
/**
 * @swagger
 * /github/link-project:
 *   post:
 *     summary: Auto-generated summary for POST /github/link-project
 *     tags: [Github]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/link-project', githubController.linkProject);
/**
 * @swagger
 * /github/activity-suggestions/{projectId}:
 *   get:
 *     summary: Auto-generated summary for GET /github/activity-suggestions/{projectId}
 *     tags: [Github]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/activity-suggestions/:projectId',
  githubController.getActivitySuggestions
);
/**
 * @swagger
 * /github/approve-tasks:
 *   post:
 *     summary: Auto-generated summary for POST /github/approve-tasks
 *     tags: [Github]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/approve-tasks', githubController.approveTasks);

module.exports = router;
