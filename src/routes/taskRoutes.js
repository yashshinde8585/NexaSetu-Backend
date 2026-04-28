const express = require('express');
/**
 * Task Execution & Ownership Routes
 * Manages atomic task operations, state transitions, and resource protection.
 */
const {
  createTask,
  getTasks,
  updateTask,
  getMyTasks,
  getTaskById,
  updateTaskStatus,
  toggleTaskBlockage,
  deleteTask,
  getSignedUploadUrl,
} = require('../controllers/taskController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middleware/validateMiddleware');
const { createTaskSchema, updateTaskSchema } = require('../validations/taskValidation');
const { verifyOwnership } = require('../middleware/ownershipMiddleware');
const { validateWorkflow } = require('../middleware/workflowMiddleware');
const Task = require('../models/Task');
const rateLimit = require('express-rate-limit');

// Rate limit: 10 uploads per minute per user
const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { status: 'fail', message: 'Too many upload requests. Please try again later.' }
});

const router = express.Router();

router.use(protect);
router.use(validateWorkflow(['workspace']));

const { cacheMiddleware } = require('../middleware/cacheMiddleware');

router.get('/my-tasks', cacheMiddleware(30), getMyTasks);
router.get('/project/:projectId', cacheMiddleware(30), getTasks);

// Secure Signed URL Generation
router.post('/attachments/upload-url', uploadLimiter, getSignedUploadUrl);

router.get('/:id', verifyOwnership(Task), getTaskById);
router.post('/', requirePermission(PERMISSIONS.CREATE_TASKS), validate(createTaskSchema), createTask);
router.patch('/:id', verifyOwnership(Task), validate(updateTaskSchema), updateTask);
router.patch('/:id/status', verifyOwnership(Task), updateTaskStatus);
router.patch('/:id/block', verifyOwnership(Task), toggleTaskBlockage);
router.delete('/:id', verifyOwnership(Task), deleteTask);

module.exports = router;
