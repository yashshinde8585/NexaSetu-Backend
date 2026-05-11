const express = require('express');
const { getDashboard, getRoleBreakdown, getIndividualBreakdown, recalculate, getWarRoomData } = require('../controllers/leadershipController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const performanceTracker = require('../middleware/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

router.get('/dashboard', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD', 'CTO'), getDashboard);
router.post('/recalculate', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD', 'CTO'), recalculate);
router.get('/function/:category/roles', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'CTO'), getRoleBreakdown);
router.get('/roles/:role/individuals', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'CTO'), getIndividualBreakdown);
router.get('/war-room/:projectId', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD', 'CTO', 'HR_MANAGER', 'HR'), getWarRoomData);

module.exports = router;

