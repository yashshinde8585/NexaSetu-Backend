const express = require('express');
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

const router = express.Router();

router.use(protect);

router.get('/my-tasks', getMyTasks);
router.get('/project/:projectId', getTasks);

router.get('/:id', getTaskById);
router.post('/', requirePermission(PERMISSIONS.CREATE_TASKS), validate(createTaskSchema), createTask);
router.patch('/:id', validate(updateTaskSchema), updateTask);
router.patch('/:id/status', updateTaskStatus);
router.patch('/:id/block', toggleTaskBlockage);

module.exports = router;
