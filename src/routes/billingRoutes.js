const express = require('express');
const billingController = require('../controllers/billingController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

// Publicly accessible plan metadata
/**
 * @swagger
 * /billing/plans:
 *   get:
 *     summary: Auto-generated summary for GET /billing/plans
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/plans', billingController.getPlans);

// Protected subscription management
router.use(protect);

/**
 * @swagger
 * /billing/subscription:
 *   get:
 *     summary: Auto-generated summary for GET /billing/subscription
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/subscription', billingController.getSubscription);
/**
 * @swagger
 * /billing/select-plan:
 *   post:
 *     summary: Auto-generated summary for POST /billing/select-plan
 *     tags: [Billing]
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
  '/select-plan',
  restrictTo('WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'),
  billingController.selectPlan
);
/**
 * @swagger
 * /billing/cancel:
 *   post:
 *     summary: Auto-generated summary for POST /billing/cancel
 *     tags: [Billing]
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
  '/cancel',
  restrictTo('WORKSPACE_ADMIN', 'WORKSPACE_MANAGER'),
  billingController.cancelSubscription
);

module.exports = router;
