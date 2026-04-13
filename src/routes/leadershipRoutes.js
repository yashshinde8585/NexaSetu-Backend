const express = require('express');
const { 
  getDashboard, 
  getRoleBreakdown, 
  getIndividualBreakdown 
} = require('../controllers/leadershipController');

const { protect, restrictTo } = require('../middleware/authMiddleware');
const performanceTracker = require('../middleware/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

// Management metrics
router.get('/dashboard', 
  restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING', 'ENGINEERING_MANAGER', 'TECH_LEAD'), 
  getDashboard
);

// Detailed analytics
router.get('/function/:category/roles', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING'), getRoleBreakdown);
router.get('/roles/:role/individuals', restrictTo('WORKSPACE_ADMIN', 'VP_ENGINEERING'), getIndividualBreakdown);

module.exports = router;

