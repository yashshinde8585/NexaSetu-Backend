const express = require('express');
const { getWorkspace } = require('../controllers/engineeringController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const performanceTracker = require('../middlewares/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

/**
 * @swagger
 * /engineering/workspace:
 *   get:
 *     summary: Auto-generated summary for GET /engineering/workspace
 *     tags: [Engineering]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/workspace',
  restrictTo(
    'WORKSPACE_ADMIN',
    'WORKSPACE_MANAGER',
    'VP_ENGINEERING',
    'ENGINEERING_MANAGER',
    'TECH_LEAD',
    'SENIOR_ENGINEER',
    'SOFTWARE_ENGINEER',
    'JUNIOR_ENGINEER',
    'INTERN',
    'PROJECT_MEMBER'
  ),
  getWorkspace
);

module.exports = router;
