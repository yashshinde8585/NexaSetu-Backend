const express = require('express');
const router = express.Router();
const executionController = require('../controllers/executionController');
const {
  checkPermission,
  enforceScope,
} = require('../services/rbac/permissionGuard');

/**
 * @swagger
 * /execution/tasks:
 *   post:
 *     summary: Auto-generated summary for POST /execution/tasks
 *     tags: [Execution]
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
  '/tasks',
  checkPermission('create:task'),
  executionController.createTask
);
/**
 * @swagger
 * /execution/tasks/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /execution/tasks/{id}
 *     tags: [Execution]
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
  '/tasks/:id',
  checkPermission('update:task'),
  executionController.updateTask
);
/**
 * @swagger
 * /execution/tasks:
 *   get:
 *     summary: Auto-generated summary for GET /execution/tasks
 *     tags: [Execution]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/tasks', enforceScope(), executionController.getTasks);

/**
 * @swagger
 * /execution/sprints:
 *   post:
 *     summary: Auto-generated summary for POST /execution/sprints
 *     tags: [Execution]
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
  '/sprints',
  checkPermission('create:sprint'),
  executionController.createSprint
);

module.exports = router;
