const express = require('express');
const epiController = require('../controllers/epiController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /epi/sprint/{sprintId}:
 *   get:
 *     summary: Auto-generated summary for GET /epi/sprint/{sprintId}
 *     tags: [Epi]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sprintId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/sprint/:sprintId', epiController.getSprintEPI);
/**
 * @swagger
 * /epi/report/{sprintId}:
 *   get:
 *     summary: Auto-generated summary for GET /epi/report/{sprintId}
 *     tags: [Epi]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sprintId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/report/:sprintId', epiController.getNarrativeReport);
/**
 * @swagger
 * /epi/task/{taskId}:
 *   get:
 *     summary: Auto-generated summary for GET /epi/task/{taskId}
 *     tags: [Epi]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/task/:taskId', epiController.getTaskEPI);
/**
 * @swagger
 * /epi/help/{taskId}:
 *   get:
 *     summary: Auto-generated summary for GET /epi/help/{taskId}
 *     tags: [Epi]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/help/:taskId', epiController.getTaskHelp);
/**
 * @swagger
 * /epi/execute-action:
 *   post:
 *     summary: Auto-generated summary for POST /epi/execute-action
 *     tags: [Epi]
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
router.post('/execute-action', epiController.executeAction);

module.exports = router;
