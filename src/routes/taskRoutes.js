const express = require('express');

const {
  createTask,
  getTasks,
  updateTask,
  getMyTasks,
  getTaskById,
  updateTaskStatus,
  toggleTaskBlockage,
  updateTaskSteps,
  deleteTask,
  getSignedUploadUrl,
  submitTaskReview,
} = require('../controllers/taskController');
const { protect, requirePermission } = require('../middlewares/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middlewares/validateMiddleware');
const {
  createTaskSchema,
  updateTaskSchema,
} = require('../validators/taskValidation');
const { verifyOwnership } = require('../middlewares/ownershipMiddleware');
const { validateWorkflow } = require('../middlewares/workflowMiddleware');
const Task = require('../models/Task');
const rateLimit = require('express-rate-limit');
const SmartRateLimitStore = require('../utils/SmartRateLimitStore');
const { cacheMiddleware } = require('../middlewares/cacheMiddleware');

const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    status: 'fail',
    message: 'Too many upload requests. Please try again later.',
  },
  store: new SmartRateLimitStore({
    prefix: 'rl:task-upload:',
    windowMs: 1 * 60 * 1000,
  }),
});

const router = express.Router();

router.use(protect);
router.use(validateWorkflow(['workspace']));

/**
 * @swagger
 * /task/my-tasks:
 *   get:
 *     summary: Auto-generated summary for GET /task/my-tasks
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/my-tasks', cacheMiddleware('task', 30), getMyTasks);
/**
 * @swagger
 * /task/project/{projectId}:
 *   get:
 *     summary: Auto-generated summary for GET /task/project/{projectId}
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/project/:projectId', cacheMiddleware('task', 30), getTasks);

// Secure Signed URL Generation
/**
 * @swagger
 * /task/attachments/upload-url:
 *   post:
 *     summary: Auto-generated summary for POST /task/attachments/upload-url
 *     tags: [Task]
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
router.post('/attachments/upload-url', uploadLimiter, getSignedUploadUrl);

/**
 * @swagger
 * /task/{id}:
 *   get:
 *     summary: Auto-generated summary for GET /task/{id}
 *     tags: [Task]
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
router.get('/:id', verifyOwnership(Task), getTaskById);
/**
 * @swagger
 * /task:
 *   post:
 *     summary: Auto-generated summary for POST /task
 *     tags: [Task]
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
  requirePermission(PERMISSIONS.CREATE_TASKS),
  validate(createTaskSchema),
  createTask
);
/**
 * @swagger
 * /task/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /task/{id}
 *     tags: [Task]
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
  verifyOwnership(Task),
  validate(updateTaskSchema),
  updateTask
);
/**
 * @swagger
 * /task/{id}/status:
 *   patch:
 *     summary: Auto-generated summary for PATCH /task/{id}/status
 *     tags: [Task]
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
router.patch('/:id/status', verifyOwnership(Task), updateTaskStatus);
/**
 * @swagger
 * /task/{id}/block:
 *   patch:
 *     summary: Auto-generated summary for PATCH /task/{id}/block
 *     tags: [Task]
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
router.patch('/:id/block', verifyOwnership(Task), toggleTaskBlockage);
/**
 * @swagger
 * /task/{id}/steps:
 *   patch:
 *     summary: Auto-generated summary for PATCH /task/{id}/steps
 *     tags: [Task]
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
router.patch('/:id/steps', verifyOwnership(Task), updateTaskSteps);
/**
 * @swagger
 * /task/{id}/review:
 *   post:
 *     summary: Auto-generated summary for POST /task/{id}/review
 *     tags: [Task]
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
router.post('/:id/review', verifyOwnership(Task), submitTaskReview);
/**
 * @swagger
 * /task/{id}:
 *   delete:
 *     summary: Auto-generated summary for DELETE /task/{id}
 *     tags: [Task]
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
router.delete('/:id', verifyOwnership(Task), deleteTask);

module.exports = router;
