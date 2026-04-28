const express = require('express');
const router = express.Router();
const observabilityController = require('../controllers/observabilityController');
const { checkPermission } = require('../services/rbac/permissionGuard');

router.get('/metrics', checkPermission('view:metrics'), observabilityController.getMetrics);
router.get('/health', checkPermission('view:health'), observabilityController.getHealth);
router.get('/reports', checkPermission('view:reports'), observabilityController.getReports);

module.exports = router;
