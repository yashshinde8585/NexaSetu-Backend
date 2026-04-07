const express = require('express');
const router = express.Router();
const epiController = require('../controllers/epiController');
const { protect } = require('../middleware/authMiddleware');

/**
 * Project Intelligence Routes
 */

// Auth protected routes
router.use(protect);

// Get sprint insights
router.get('/sprint/:sprintId', epiController.getSprintEPI);

// Get narrative report
router.get('/report/:sprintId', epiController.getNarrativeReport);

// Get task insights
router.get('/task/:taskId', epiController.getTaskEPI);

// Get implementation help
router.get('/help/:taskId', epiController.getTaskHelp);

// Execute automated action
router.post('/execute-action', epiController.executeAction);

module.exports = router;
