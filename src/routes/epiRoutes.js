const express = require('express');
const epiController = require('../controllers/epiController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/sprint/:sprintId', epiController.getSprintEPI);
router.get('/report/:sprintId', epiController.getNarrativeReport);
router.get('/task/:taskId', epiController.getTaskEPI);
router.get('/help/:taskId', epiController.getTaskHelp);
router.post('/execute-action', epiController.executeAction);

module.exports = router;
