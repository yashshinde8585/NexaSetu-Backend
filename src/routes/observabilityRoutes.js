const express = require('express');
const router = express.Router();
const observabilityController = require('../controllers/observabilityController');
const { protect } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../services/rbac/permissionGuard');

router.use(protect);

/**
 * @swagger
 * /observability/metrics:
 *   get:
 *     summary: Auto-generated summary for GET /observability/metrics
 *     tags: [Observability]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/metrics',
  checkPermission('view:metrics'),
  observabilityController.getMetrics
);
/**
 * @swagger
 * /observability/health:
 *   get:
 *     summary: Auto-generated summary for GET /observability/health
 *     tags: [Observability]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/health',
  checkPermission('view:health'),
  observabilityController.getHealth
);
/**
 * @swagger
 * /observability/reports:
 *   get:
 *     summary: Auto-generated summary for GET /observability/reports
 *     tags: [Observability]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/reports',
  checkPermission('view:reports'),
  observabilityController.getReports
);

module.exports = router;
