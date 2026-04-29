const express = require('express');
const sprintController = require('../controllers/sprintController');
const sprintStatsController = require('../controllers/sprintStatsController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middleware/validateMiddleware');
const { createSprintSchema, updateSprintSchema } = require('../validations/sprintValidation');

const router = express.Router();

const { cacheMiddleware } = require('../middleware/cacheMiddleware');

router.use(protect);

router.get('/', cacheMiddleware('sprint', 60), sprintController.getAllSprints);
router.post('/', requirePermission(PERMISSIONS.CREATE_SPRINT), validate(createSprintSchema), sprintController.createSprint);

router.get('/:id', cacheMiddleware('sprint', 60), sprintController.getSprint);
router.patch('/:id', requirePermission(PERMISSIONS.EDIT_SPRINT), validate(updateSprintSchema), sprintController.updateSprint);
router.delete('/:id', requirePermission(PERMISSIONS.EDIT_SPRINT), sprintController.deleteSprint);

router.post('/:id/sync', sprintController.syncSprintHealth);
router.get('/:id/stats', cacheMiddleware('sprint', 30), sprintStatsController.getSprintStats);
router.get('/:id/finalize', sprintStatsController.finalizeSprint);
router.get('/:id/report', sprintStatsController.getSprintReportData);

module.exports = router;
