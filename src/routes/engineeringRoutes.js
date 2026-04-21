const express = require('express');
const { getWorkspace } = require('../controllers/engineeringController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const performanceTracker = require('../middleware/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

router.get('/workspace', restrictTo('WORKSPACE_ADMIN', 'WORKSPACE_MANAGER', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD', 'SENIOR_ENGINEER', 'SOFTWARE_ENGINEER', 'JUNIOR_ENGINEER', 'INTERN', 'PROJECT_MEMBER'), getWorkspace);

module.exports = router;
