const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

router.post('/invite', protect, requirePermission(PERMISSIONS.INVITE_USERS), teamController.inviteUser);
router.post('/invite-bulk', protect, requirePermission(PERMISSIONS.INVITE_USERS), teamController.inviteMultipleUsers);
router.get('/members', protect, teamController.getWorkspaceTeam);
router.get('/invites/:token', teamController.getInviteByToken);

module.exports = router;
