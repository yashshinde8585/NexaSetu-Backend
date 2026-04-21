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
} = require('../controllers/taskController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middleware/validateMiddleware');
const { createTaskSchema, updateTaskSchema } = require('../validations/taskValidation');
const { verifyOwnership } = require('../middleware/ownershipMiddleware');
const { validateWorkflow } = require('../middleware/workflowMiddleware');
const Task = require('../models/Task');

const router = express.Router();

router.use(protect);
router.use(validateWorkflow(['workspace']));

router.get('/my-tasks', getMyTasks);
router.get('/project/:projectId', getTasks);

router.get('/:id', verifyOwnership(Task), getTaskById);
router.post('/', requirePermission(PERMISSIONS.CREATE_TASKS), validate(createTaskSchema), createTask);
router.patch('/:id', verifyOwnership(Task), validate(updateTaskSchema), updateTask);
router.patch('/:id/status', verifyOwnership(Task), updateTaskStatus);
router.patch('/:id/block', verifyOwnership(Task), toggleTaskBlockage);

module.exports = router;
