const express = require('express');
const sprintController = require('../controllers/sprintController');
const sprintStatsController = require('../controllers/sprintStatsController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(protect);

router.route('/:id/sync').post(sprintController.syncSprintHealth);
router.route('/:id/stats').get(sprintStatsController.getSprintStats);

router.route('/:id/finalize').get(sprintStatsController.finalizeSprint);

router.route('/:id/report').get(sprintStatsController.getSprintReportData);

router
  .route('/')
  .get(sprintController.getAllSprints)
  .post(
    requirePermission(PERMISSIONS.CREATE_PROJECT),
    sprintController.createSprint
  );

router
  .route('/:id')
  .get(sprintController.getSprint)
  .patch(
    requirePermission(PERMISSIONS.EDIT_PROJECT),
    sprintController.updateSprint
  )
  .delete(
    requirePermission(PERMISSIONS.EDIT_PROJECT),
    sprintController.deleteSprint
  );

module.exports = router;
