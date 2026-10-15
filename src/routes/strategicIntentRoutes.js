const express = require('express');
const strategicIntentController = require('../controllers/strategicIntentController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /strategicintent/hub/{projectId}:
 *   get:
 *     summary: Auto-generated summary for GET /strategicintent/hub/{projectId}
 *     tags: [StrategicIntent]
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
router.get('/hub/:projectId', strategicIntentController.getStrategicHub);
/**
 * @swagger
 * /strategicintent/generate:
 *   post:
 *     summary: Auto-generated summary for POST /strategicintent/generate
 *     tags: [StrategicIntent]
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
router.post('/generate', strategicIntentController.generateFromIntent);
/**
 * @swagger
 * /strategicintent/alignment/{taskId}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /strategicintent/alignment/{taskId}
 *     tags: [StrategicIntent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
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
router.patch(
  '/alignment/:taskId',
  strategicIntentController.updateStrategicAlignment
);
/**
 * @swagger
 * /strategicintent/graph:
 *   get:
 *     summary: Auto-generated summary for GET /strategicintent/graph
 *     tags: [StrategicIntent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/graph', strategicIntentController.getDependencyGraph);

module.exports = router;
