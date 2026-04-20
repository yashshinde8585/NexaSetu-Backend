const express = require('express');
const {
  createProject,
  getProjects,
  getProject,
  getProjectAnalytics,
  updateProject,
} = require('../controllers/projectController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middleware/validateMiddleware');
const { createProjectSchema, updateProjectSchema } = require('../validations/projectValidation');

const router = express.Router();

router.use(protect);

router.post('/', requirePermission(PERMISSIONS.CREATE_PROJECT), validate(createProjectSchema), createProject);
router.get('/', getProjects);
router.get('/:id', getProject);
router.patch('/:id', validate(updateProjectSchema), updateProject);
router.get('/:id/analytics', getProjectAnalytics);

module.exports = router;
