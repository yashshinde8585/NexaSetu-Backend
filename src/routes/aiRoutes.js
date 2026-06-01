const express = require('express');
const { extractTask } = require('../controllers/aiController');
const {
  getPortfolioRecommendations,
} = require('../controllers/aiRecommendationController');
const { getActivityLogs } = require('../controllers/aiActivityController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /ai/extract:
 *   post:
 *     summary: Auto-generated summary for POST /ai/extract
 *     tags: [Ai]
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
router.post('/extract', extractTask);
/**
 * @swagger
 * /ai/portfolio-recommendations:
 *   get:
 *     summary: Auto-generated summary for GET /ai/portfolio-recommendations
 *     tags: [Ai]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/portfolio-recommendations', getPortfolioRecommendations);
/**
 * @swagger
 * /ai/activity-logs:
 *   get:
 *     summary: Auto-generated summary for GET /ai/activity-logs
 *     tags: [Ai]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/activity-logs', getActivityLogs);

module.exports = router;
