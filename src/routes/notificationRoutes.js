const express = require('express');
const {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteAllMyNotifications,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getMyNotifications);
router.get('/my-notifications', getMyNotifications);
router.patch('/mark-read/:id', markAsRead);
router.patch('/mark-all-read', markAllAsRead);
router.delete('/clear-all', deleteAllMyNotifications);

module.exports = router;
