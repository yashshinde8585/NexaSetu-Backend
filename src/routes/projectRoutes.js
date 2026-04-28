const express = require('express');
/**
 * Project Orchestration Routes
 * Governs project lifecycle, analytics, and access-controlled modifications.
 */
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
const { validateWorkflow } = require('../middleware/workflowMiddleware');
const { checkLimit } = require('../middleware/billingMiddleware');
const Project = require('../models/Project');

const router = express.Router();

router.use(protect);
router.use(validateWorkflow(['workspace']));

// Apply billing limit check before project creation.
// getUsage dynamically counts current active projects for the workspace.
router.post('/', 
  requirePermission(PERMISSIONS.CREATE_PROJECT), 
  checkLimit('projects', async (req) => {
    return await Project.countDocuments({ workspaceId: req.user.workspaceId, status: { $ne: 'archived' } });
  }),
  validate(createProjectSchema), 
  createProject
);
router.get('/', getProjects);
router.get('/:id', getProject);
router.patch('/:id', validate(updateProjectSchema), updateProject);
router.get('/:id/analytics', getProjectAnalytics);

module.exports = router;
