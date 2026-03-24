const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Middleware to protect all routes
router.use(protect);

router.get('/stats', dashboardController.getDashboardStats);

module.exports = router;
