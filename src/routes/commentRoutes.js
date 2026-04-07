const express = require('express');
const {
  getTaskComments,
  addComment,
} = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Secure discussion feed access via mandatory authentication.

router.get('/task/:taskId', getTaskComments);
router.post('/task/:taskId', addComment);

module.exports = router;
