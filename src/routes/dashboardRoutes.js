const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

const { cacheMiddleware } = require('../middlewares/cacheMiddleware');

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Auto-generated summary for GET /dashboard/stats
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/stats',
  cacheMiddleware('route', 60),
  dashboardController.getDashboardStats
);

module.exports = router;
