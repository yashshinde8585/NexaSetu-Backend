const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.post('/invite', protect, restrictTo('ADMIN', 'MANAGER'), teamController.inviteUser);
router.post('/invite-bulk', protect, restrictTo('ADMIN', 'MANAGER'), teamController.inviteMultipleUsers);
router.get('/members', protect, teamController.getWorkspaceTeam);
router.get('/invites/:token', teamController.getInviteByToken);

module.exports = router;
