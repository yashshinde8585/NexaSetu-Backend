const express = require('express');
const router = express.Router();
const rbacController = require('../controllers/rbacController');
const { protect } = require('../middleware/authMiddleware');
const { checkRole } = require('../services/rbac/permissionGuard');

router.use(protect);

router.get('/roles', rbacController.getRoles);
router.post('/roles', checkRole('ADMIN'), rbacController.createRole);
router.patch('/roles/:id', checkRole('ADMIN'), rbacController.updateRole);
router.get('/permissions', rbacController.getPermissions);
router.get('/teams', rbacController.getTeams);

module.exports = router;
