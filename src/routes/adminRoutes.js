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
const { protect, restrictTo } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { createTeamSchema, updateTeamSchema } = require('../validations/teamValidation');

const router = express.Router();

router.use(protect);
router.use(restrictTo('WORKSPACE_ADMIN'));

router.get('/dashboard', getAdminDashboard);

router.post('/invite-user', inviteUser);
router.patch('/user-role', updateUserRole);
router.patch('/deactivate-user', deactivateUser);

router.post('/teams', validate(createTeamSchema), createTeam);
router.patch('/teams/:id', validate(updateTeamSchema), updateTeamController);
router.delete('/teams/:id', deleteTeam);

// Role & permissions management
router.post('/roles', createRole);
router.patch('/role-permissions', updateRolePermissions);

// Workspace settings
router.patch('/settings', updateSettings);

module.exports = router;
