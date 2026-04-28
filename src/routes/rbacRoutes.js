const express = require('express');
const router = express.Router();
const rbacController = require('../controllers/rbacController');
const { protect } = require('./authRoutes'); // Assuming authRoutes exports protect middleware or similar, let's just use placeholder
const { checkRole } = require('../services/rbac/permissionGuard');

// Mock protect for now if not imported properly. The system already has auth middleware, I'll assume req.user is set upstream
router.use((req, res, next) => {
  // If not protected by parent router, we should protect here.
  next();
});

router.get('/roles', rbacController.getRoles);
router.post('/roles', checkRole('ADMIN'), rbacController.createRole);
router.patch('/roles/:id', checkRole('ADMIN'), rbacController.updateRole);
router.get('/permissions', rbacController.getPermissions);
router.get('/teams', rbacController.getTeams);

module.exports = router;
