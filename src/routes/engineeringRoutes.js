const express = require('express');
const { getWorkspace } = require('../controllers/engineeringController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const performanceTracker = require('../middleware/telemetryMiddleware');

const router = express.Router();

router.use(protect);
router.use(performanceTracker);

// Engineering workforce data
router.get('/workspace', 
  restrictTo('SENIOR_ENGINEER', 'SOFTWARE_ENGINEER', 'JUNIOR_ENGINEER', 'INTERN'), 
  getWorkspace
);

module.exports = router;
