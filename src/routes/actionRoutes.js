const express = require('express');
const {
  getPendingActions,
  approveAction,
  rejectAction,
} = require('../controllers/actionController');
const { protect, requirePermission } = require('../middlewares/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /action/pending:
 *   get:
 *     summary: Auto-generated summary for GET /action/pending
 *     tags: [Action]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/pending', getPendingActions);
/**
 * @swagger
 * /action/{actionId}/approve:
 *   post:
 *     summary: Auto-generated summary for POST /action/{actionId}/approve
 *     tags: [Action]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: actionId
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
router.post(
  '/:actionId/approve',
  requirePermission(PERMISSIONS.APPROVE_AI_ACTIONS),
  approveAction
);
/**
 * @swagger
 * /action/{actionId}/reject:
 *   post:
 *     summary: Auto-generated summary for POST /action/{actionId}/reject
 *     tags: [Action]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: actionId
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
router.post(
  '/:actionId/reject',
  requirePermission(PERMISSIONS.APPROVE_AI_ACTIONS),
  rejectAction
);

module.exports = router;
