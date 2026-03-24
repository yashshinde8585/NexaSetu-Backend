const express = require('express');
const { extractTask } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/extract', extractTask);

module.exports = router;
