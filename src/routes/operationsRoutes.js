const express = require('express');
const { getDashboard } = require('../controllers/operationsController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const performanceTracker = require('../middleware/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

router.get('/dashboard', restrictTo('QA_LEAD', 'QA', 'SQA', 'PEOPLE_OPS'), getDashboard);

module.exports = router;
