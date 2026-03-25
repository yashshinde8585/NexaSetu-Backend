const express = require('express');
const { getPendingActions, approveAction, rejectAction } = require('../controllers/actionController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/pending', getPendingActions);
router.post('/:actionId/approve', approveAction);
router.post('/:actionId/reject', rejectAction);

module.exports = router;
