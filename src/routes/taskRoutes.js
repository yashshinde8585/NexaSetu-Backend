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

const router = express.Router();

router.use(protect); // Protect all task routes

router.post('/', requirePermission(PERMISSIONS.CREATE_TASKS), createTask);
router.get('/my-tasks', getMyTasks);
router.get('/project/:projectId', getTasks);
router.get('/:id', getTaskById);
router.patch('/:id', updateTask);
router.patch('/:id/status', updateTaskStatus); // Direct status change
router.patch('/:id/block', toggleTaskBlockage); // Toggle blockage

module.exports = router;
