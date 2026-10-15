const express = require('express');
const router = express.Router();
const observabilityController = require('../controllers/observabilityController');

// Public health endpoints
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Auto-generated summary for GET /health
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/', observabilityController.getHealth);
/**
 * @swagger
 * /health/integrity:
 *   get:
 *     summary: Auto-generated summary for GET /health/integrity
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/integrity', observabilityController.getIntegrity);

module.exports = router;
