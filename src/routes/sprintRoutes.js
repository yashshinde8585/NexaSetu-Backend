const express = require('express');
const sprintController = require('../controllers/sprintController');
const sprintStatsController = require('../controllers/sprintStatsController');
const { protect, requirePermission } = require('../middlewares/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middlewares/validateMiddleware');
const {
  createSprintSchema,
  updateSprintSchema,
} = require('../validators/sprintValidation');

const router = express.Router();

const { cacheMiddleware } = require('../middlewares/cacheMiddleware');

router.use(protect);

/**
 * @swagger
 * /sprint:
 *   get:
 *     summary: Auto-generated summary for GET /sprint
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/', cacheMiddleware('sprint', 60), sprintController.getAllSprints);
/**
 * @swagger
 * /sprint:
 *   post:
 *     summary: Auto-generated summary for POST /sprint
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post(
  '/',
  requirePermission(PERMISSIONS.CREATE_SPRINT),
  validate(createSprintSchema),
  sprintController.createSprint
);

/**
 * @swagger
 * /sprint/{id}/sync:
 *   post:
 *     summary: Auto-generated summary for POST /sprint/{id}/sync
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/:id/sync', sprintController.syncSprintHealth);
/**
 * @swagger
 * /sprint/{id}/stats:
 *   get:
 *     summary: Auto-generated summary for GET /sprint/{id}/stats
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get(
  '/:id/stats',
  cacheMiddleware('sprint', 30),
  sprintStatsController.getSprintStats
);
/**
 * @swagger
 * /sprint/{id}/finalize:
 *   get:
 *     summary: Auto-generated summary for GET /sprint/{id}/finalize
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/:id/finalize', sprintStatsController.finalizeSprint);
/**
 * @swagger
 * /sprint/{id}/report:
 *   get:
 *     summary: Auto-generated summary for GET /sprint/{id}/report
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/:id/report', sprintStatsController.getSprintReportData);

/**
 * @swagger
 * /sprint/{id}:
 *   get:
 *     summary: Auto-generated summary for GET /sprint/{id}
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/:id', cacheMiddleware('sprint', 60), sprintController.getSprint);
/**
 * @swagger
 * /sprint/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /sprint/{id}
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.EDIT_SPRINT),
  validate(updateSprintSchema),
  sprintController.updateSprint
);
/**
 * @swagger
 * /sprint/{id}:
 *   delete:
 *     summary: Auto-generated summary for DELETE /sprint/{id}
 *     tags: [Sprint]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.EDIT_SPRINT),
  sprintController.deleteSprint
);

module.exports = router;
