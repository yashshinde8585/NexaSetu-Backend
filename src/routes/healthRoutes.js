const express = require('express');
const router = express.Router();
const observabilityController = require('../controllers/observabilityController');

// Public health endpoints
router.get('/', observabilityController.getHealth);
router.get('/integrity', observabilityController.getIntegrity);

module.exports = router;
