const express = require('express');
const resourceController = require('../controllers/resourceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/workload', resourceController.getResourceWorkload);

module.exports = router;
