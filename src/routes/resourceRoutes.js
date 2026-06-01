const express = require('express');
const resourceController = require('../controllers/resourceController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /resource/workload:
 *   get:
 *     summary: Auto-generated summary for GET /resource/workload
 *     tags: [Resource]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/workload', resourceController.getResourceWorkload);

module.exports = router;
