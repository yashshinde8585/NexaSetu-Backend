const express = require('express');
const { getDashboard } = require('../controllers/operationsController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const performanceTracker = require('../middlewares/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

/**
 * @swagger
 * /operations/dashboard:
 *   get:
 *     summary: Auto-generated summary for GET /operations/dashboard
 *     tags: [Operations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/dashboard',
  restrictTo(
    'WORKSPACE_ADMIN',
    'WORKSPACE_MANAGER',
    'QA_LEAD',
    'QA',
    'SQA',
    'QA_ENGINEER',
    'SENIOR_QA_ENGINEER',
    'HR',
    'PROJECT_MEMBER',
    'SOFTWARE_ENGINEER',
    'SENIOR_ENGINEER',
    'TECH_LEAD',
    'ENGINEERING_MANAGER',
    'VP_ENGINEERING',
    'JUNIOR_ENGINEER',
    'INTERN'
  ),
  getDashboard
);

module.exports = router;
