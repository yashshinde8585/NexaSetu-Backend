const express = require('express');
const { executeMagicCommand } = require('../controllers/magicBarController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/execute', executeMagicCommand);

module.exports = router;
