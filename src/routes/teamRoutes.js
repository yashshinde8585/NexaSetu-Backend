const express = require('express');
const teamController = require('../controllers/teamController');
const { protect, requirePermission } = require('../middlewares/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');
const validate = require('../middlewares/validateMiddleware');

const router = express.Router();

// Public route — no auth required for token lookup
/**
 * @swagger
 * /team/invites/{token}:
 *   get:
 *     summary: Auto-generated summary for GET /team/invites/{token}
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/invites/:token', teamController.getInviteByToken);

// All routes below require authentication
router.use(protect);

/**
 * @swagger
 * /team/members:
 *   get:
 *     summary: Auto-generated summary for GET /team/members
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/members', teamController.getWorkspaceTeam);
/**
 * @swagger
 * /team/roles:
 *   get:
 *     summary: Auto-generated summary for GET /team/roles
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/roles', teamController.getWorkspaceRoles);

/**
 * @swagger
 * /team/invite:
 *   post:
 *     summary: Auto-generated summary for POST /team/invite
 *     tags: [Team]
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
  '/invite',
  requirePermission(PERMISSIONS.INVITE_USERS),
  teamController.inviteUser
);
/**
 * @swagger
 * /team/invite-bulk:
 *   post:
 *     summary: Auto-generated summary for POST /team/invite-bulk
 *     tags: [Team]
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
  '/invite-bulk',
  requirePermission(PERMISSIONS.INVITE_USERS),
  teamController.inviteMultipleUsers
);
/**
 * @swagger
 * /team/invites/{id}:
 *   delete:
 *     summary: Auto-generated summary for DELETE /team/invites/{id}
 *     tags: [Team]
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
router.delete(
  '/invites/:id',
  requirePermission(PERMISSIONS.INVITE_USERS),
  teamController.removeInvitation
);
/**
 * @swagger
 * /team/members/{id}/project:
 *   patch:
 *     summary: Auto-generated summary for PATCH /team/members/{id}/project
 *     tags: [Team]
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
  '/members/:id/project',
  requirePermission(PERMISSIONS.INVITE_USERS),
  teamController.updateMemberProject
);

module.exports = router;
