const express = require('express');
const { getPendingActions, approveAction, rejectAction } = require('../controllers/actionController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(protect);

router.get('/pending', getPendingActions);
router.post('/:actionId/approve', requirePermission(PERMISSIONS.APPROVE_AI_ACTIONS), approveAction);
router.post('/:actionId/reject', requirePermission(PERMISSIONS.APPROVE_AI_ACTIONS), rejectAction);

module.exports = router;
