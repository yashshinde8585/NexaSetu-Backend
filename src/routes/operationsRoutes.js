const express = require('express');
const { getDashboard } = require('../controllers/operationsController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const performanceTracker = require('../middleware/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

router.get('/dashboard', restrictTo('WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'QA_LEAD', 'QA', 'SQA', 'QA_ENGINEER', 'SENIOR_QA_ENGINEER', 'PEOPLE_OPS', 'PROJECT_MEMBER'), getDashboard);

module.exports = router;
