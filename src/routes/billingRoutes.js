const express = require('express');
const billingController = require('../controllers/billingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Publicly accessible plan metadata
router.get('/plans', billingController.getPlans);

// Protected subscription management
router.use(protect);

router.get('/subscription', billingController.getSubscription);
router.post('/select-plan', billingController.selectPlan);
router.post('/cancel', billingController.cancelSubscription);

module.exports = router;
