const express = require('express');
const teamController = require('../controllers/teamController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');
const validate = require('../middleware/validateMiddleware');

const router = express.Router();

// Public route — no auth required for token lookup
router.get('/invites/:token', teamController.getInviteByToken);

// All routes below require authentication
router.use(protect);

router.get('/members', teamController.getWorkspaceTeam);
router.get('/roles', teamController.getWorkspaceRoles);

router.post('/invite', requirePermission(PERMISSIONS.INVITE_USERS), teamController.inviteUser);
router.post('/invite-bulk', requirePermission(PERMISSIONS.INVITE_USERS), teamController.inviteMultipleUsers);
router.delete('/invites/:id', requirePermission(PERMISSIONS.INVITE_USERS), teamController.removeInvitation);
router.patch('/members/:id/project', requirePermission(PERMISSIONS.INVITE_USERS), teamController.updateMemberProject);

module.exports = router;
