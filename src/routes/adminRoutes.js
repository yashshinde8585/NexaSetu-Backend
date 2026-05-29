const express = require('express');
const {
  getAdminDashboard,
  updateSettings,
  inviteUser,
  deactivateUser,
  updateUserRole,
  createTeam,
  updateTeam: updateTeamController,
  deleteTeam,
  updateRolePermissions,
  createRole,
} = require('../controllers/adminController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const {
  createTeamSchema,
  updateTeamSchema,
} = require('../validators/teamValidation');

const router = express.Router();

router.use(protect);
router.use(restrictTo('WORKSPACE_ADMIN'));

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     summary: Auto-generated summary for GET /admin/dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/dashboard', getAdminDashboard);

/**
 * @swagger
 * /admin/invite-user:
 *   post:
 *     summary: Auto-generated summary for POST /admin/invite-user
 *     tags: [Admin]
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
router.post('/invite-user', inviteUser);
/**
 * @swagger
 * /admin/user-role:
 *   patch:
 *     summary: Auto-generated summary for PATCH /admin/user-role
 *     tags: [Admin]
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
router.patch('/user-role', updateUserRole);
/**
 * @swagger
 * /admin/deactivate-user:
 *   patch:
 *     summary: Auto-generated summary for PATCH /admin/deactivate-user
 *     tags: [Admin]
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
router.patch('/deactivate-user', deactivateUser);

/**
 * @swagger
 * /admin/teams:
 *   post:
 *     summary: Auto-generated summary for POST /admin/teams
 *     tags: [Admin]
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
router.post('/teams', validate(createTeamSchema), createTeam);
/**
 * @swagger
 * /admin/teams/{id}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /admin/teams/{id}
 *     tags: [Admin]
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
router.patch('/teams/:id', validate(updateTeamSchema), updateTeamController);
/**
 * @swagger
 * /admin/teams/{id}:
 *   delete:
 *     summary: Auto-generated summary for DELETE /admin/teams/{id}
 *     tags: [Admin]
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
router.delete('/teams/:id', deleteTeam);

// Role & permissions management
/**
 * @swagger
 * /admin/roles:
 *   post:
 *     summary: Auto-generated summary for POST /admin/roles
 *     tags: [Admin]
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
router.post('/roles', createRole);
/**
 * @swagger
 * /admin/role-permissions:
 *   patch:
 *     summary: Auto-generated summary for PATCH /admin/role-permissions
 *     tags: [Admin]
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
router.patch('/role-permissions', updateRolePermissions);

// Workspace settings
/**
 * @swagger
 * /admin/settings:
 *   patch:
 *     summary: Auto-generated summary for PATCH /admin/settings
 *     tags: [Admin]
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
router.patch('/settings', updateSettings);

module.exports = router;
