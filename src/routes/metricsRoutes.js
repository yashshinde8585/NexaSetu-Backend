const express = require('express');
const { trackEvent } = require('../controllers/metricsController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * Telemetry & Behavioral Tracking Routes
 * Aggregates anonymous and identified events for system optimization.
 */
/**
 * @swagger
 * /metrics/event:
 *   post:
 *     summary: Auto-generated summary for POST /metrics/event
 *     tags: [Metrics]
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
router.post('/event', protect, trackEvent);

module.exports = router;
