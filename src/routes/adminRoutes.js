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
  createRole
} = require('../controllers/adminController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictTo('WORKSPACE_ADMIN'));

// Workspace administration routes
router.get('/dashboard', getAdminDashboard);
router.post('/invite-user', inviteUser);
router.post('/create-team', createTeam);
router.patch('/update-team/:id', updateTeamController);
router.delete('/delete-team/:id', deleteTeam);
router.patch('/role-permissions', updateRolePermissions);
router.post('/create-role', createRole);

// Organization settings
router.patch('/settings', updateSettings);
router.patch('/user-role', updateUserRole);
router.patch('/deactivate-user', deactivateUser);

module.exports = router;
