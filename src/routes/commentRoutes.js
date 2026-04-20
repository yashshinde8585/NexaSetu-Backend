const express = require('express');
const { getTaskComments, addComment } = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/task/:taskId', getTaskComments);
router.post('/task/:taskId', addComment);

module.exports = router;
