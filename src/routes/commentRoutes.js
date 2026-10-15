const express = require('express');
const {
  getTaskComments,
  addComment,
} = require('../controllers/commentController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /comment/task/{taskId}:
 *   get:
 *     summary: Auto-generated summary for GET /comment/task/{taskId}
 *     tags: [Comment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/task/:taskId', getTaskComments);
/**
 * @swagger
 * /comment/task/{taskId}:
 *   post:
 *     summary: Auto-generated summary for POST /comment/task/{taskId}
 *     tags: [Comment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
router.post('/task/:taskId', addComment);

module.exports = router;
