const express = require('express');

const {
  createProject,
  getProjects,
  getProject,
  getProjectAnalytics,
  updateProject,
} = require('../controllers/projectController');
const { protect, requirePermission } = require('../middlewares/authMiddleware');
const { verifyOwnership } = require('../middlewares/ownershipMiddleware');
const { cacheMiddleware } = require('../middlewares/cacheMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const validate = require('../middlewares/validateMiddleware');
const {
  createProjectSchema,
  updateProjectSchema,
} = require('../validators/projectValidation');
const { validateWorkflow } = require('../middlewares/workflowMiddleware');
const { checkLimit } = require('../middlewares/billingMiddleware');
const Project = require('../models/Project');

const router = express.Router();

router.use(protect);
router.use(validateWorkflow(['workspace']));

/**
 * @swagger
 * /project:
 *   post:
 *     summary: Auto-generated summary for POST /project
 *     tags: [Project]
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
  requirePermission(PERMISSIONS.CREATE_PROJECT),
  checkLimit('projects', async (req) => {
    return await Project.countDocuments({
      workspaceId: req.user.workspaceId,
      status: { $ne: 'archived' },
    });
  }),
  validate(createProjectSchema),
  createProject
);
/**
 * @swagger
 * /project:
 *   get:
 *     summary: Auto-generated summary for GET /project
 *     tags: [Project]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/', cacheMiddleware('project', 60), getProjects);
/**
 * @swagger
 * /project/{id}:
 *   get:
 *     summary: Auto-generated summary for GET /project/{id}
 *     tags: [Project]
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
router.get(
  '/:id',
  verifyOwnership(Project),
  cacheMiddleware('project', 60),
  getProject
);
/**
 * @swagger
 * /project/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /project/{id}
 *     tags: [Project]
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
  verifyOwnership(Project),
  validate(updateProjectSchema),
  updateProject
);
/**
 * @swagger
 * /project/{id}/analytics:
 *   get:
 *     summary: Auto-generated summary for GET /project/{id}/analytics
 *     tags: [Project]
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
router.get(
  '/:id/analytics',
  verifyOwnership(Project),
  cacheMiddleware('project', 30),
  getProjectAnalytics
);

module.exports = router;
