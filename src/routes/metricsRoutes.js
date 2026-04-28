const express = require('express');
const { trackEvent } = require('../controllers/metricsController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Telemetry & Behavioral Tracking Routes
 * Aggregates anonymous and identified events for system optimization.
 */
router.post('/event', protect, trackEvent);

module.exports = router;
