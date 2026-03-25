const express = require('express');
const { extractTask } = require('../controllers/aiController');
const { getPortfolioRecommendations } = require('../controllers/aiRecommendationController');
const { getActivityLogs } = require('../controllers/aiActivityController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/extract', extractTask);
router.get('/portfolio-recommendations', getPortfolioRecommendations);
router.get('/activity-logs', getActivityLogs);

module.exports = router;
