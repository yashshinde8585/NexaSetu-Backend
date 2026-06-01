const express = require('express');
const {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteAllMyNotifications,
} = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /notification:
 *   get:
 *     summary: Auto-generated summary for GET /notification
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/', getMyNotifications);
/**
 * @swagger
 * /notification/my-notifications:
 *   get:
 *     summary: Auto-generated summary for GET /notification/my-notifications
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/my-notifications', getMyNotifications);
/**
 * @swagger
 * /notification/mark-read/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /notification/mark-read/{id}
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
router.patch('/mark-read/:id', markAsRead);
/**
 * @swagger
 * /notification/mark-all-read:
 *   patch:
 *     summary: Auto-generated summary for PATCH /notification/mark-all-read
 *     tags: [Notification]
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
router.patch('/mark-all-read', markAllAsRead);
/**
 * @swagger
 * /notification/clear-all:
 *   delete:
 *     summary: Auto-generated summary for DELETE /notification/clear-all
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.delete('/clear-all', deleteAllMyNotifications);

module.exports = router;
