const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

const { cacheMiddleware } = require('../middleware/cacheMiddleware');

router.get('/stats', cacheMiddleware('route', 60), dashboardController.getDashboardStats);

module.exports = router;
