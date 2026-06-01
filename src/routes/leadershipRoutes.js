const express = require('express');
const {
  getDashboard,
  getRoleBreakdown,
  getIndividualBreakdown,
  recalculate,
  getWarRoomData,
} = require('../controllers/leadershipController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const performanceTracker = require('../middlewares/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

/**
 * @swagger
 * /leadership/dashboard:
 *   get:
 *     summary: Auto-generated summary for GET /leadership/dashboard
 *     tags: [Leadership]
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
    'VP_ENGINEERING',
    'ENGINEERING_MANAGER',
    'TECH_LEAD',
    'CTO'
  ),
  getDashboard
);
/**
 * @swagger
 * /leadership/recalculate:
 *   post:
 *     summary: Auto-generated summary for POST /leadership/recalculate
 *     tags: [Leadership]
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
router.post(
  '/recalculate',
  restrictTo(
    'WORKSPACE_ADMIN',
    'VP_ENGINEERING',
    'ENGINEERING_MANAGER',
    'TECH_LEAD',
    'CTO'
  ),
  recalculate
);
/**
 * @swagger
 * /leadership/function/{category}/roles:
 *   get:
 *     summary: Auto-generated summary for GET /leadership/function/{category}/roles
 *     tags: [Leadership]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/function/:category/roles',
  restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'CTO'),
  getRoleBreakdown
);
/**
 * @swagger
 * /leadership/roles/{role}/individuals:
 *   get:
 *     summary: Auto-generated summary for GET /leadership/roles/{role}/individuals
 *     tags: [Leadership]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/roles/:role/individuals',
  restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'CTO'),
  getIndividualBreakdown
);
/**
 * @swagger
 * /leadership/war-room/{projectId}:
 *   get:
 *     summary: Auto-generated summary for GET /leadership/war-room/{projectId}
 *     tags: [Leadership]
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
  '/war-room/:projectId',
  restrictTo(
    'WORKSPACE_ADMIN',
    'VP_ENGINEERING',
    'ENGINEERING_MANAGER',
    'TECH_LEAD',
    'CTO',
    'HR_MANAGER',
    'HR'
  ),
  getWarRoomData
);

module.exports = router;
