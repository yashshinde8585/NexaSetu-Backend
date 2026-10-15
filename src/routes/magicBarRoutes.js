const express = require('express');
const { executeMagicCommand } = require('../controllers/magicBarController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /magicbar/execute:
 *   post:
 *     summary: Auto-generated summary for POST /magicbar/execute
 *     tags: [MagicBar]
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
router.post('/execute', executeMagicCommand);

module.exports = router;
