const express = require('express');

const {
  createProject,
  getProjects,
  getProject,
  getProjectAnalytics,
  updateProject,
} = require('../controllers/projectController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { verifyOwnership } = require('../middleware/ownershipMiddleware');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middleware/validateMiddleware');
const { createProjectSchema, updateProjectSchema } = require('../validations/projectValidation');
const { validateWorkflow } = require('../middleware/workflowMiddleware');
const { checkLimit } = require('../middleware/billingMiddleware');
const Project = require('../models/Project');

const router = express.Router();

router.use(protect);
router.use(validateWorkflow(['workspace']));

router.post('/', 
  requirePermission(PERMISSIONS.CREATE_PROJECT), 
  checkLimit('projects', async (req) => {
    return await Project.countDocuments({ workspaceId: req.user.workspaceId, status: { $ne: 'archived' } });
  }),
  validate(createProjectSchema), 
  createProject
);
router.get('/', cacheMiddleware('project', 60), getProjects);
router.get('/:id', verifyOwnership(Project), cacheMiddleware('project', 60), getProject);
router.patch('/:id', verifyOwnership(Project), validate(updateProjectSchema), updateProject);
router.get('/:id/analytics', verifyOwnership(Project), cacheMiddleware('project', 30), getProjectAnalytics);

module.exports = router;
