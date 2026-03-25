const express = require('express');
const { registerUser, loginUser, logoutUser, getMe, activateInvitation } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/activate', activateInvitation);
router.get('/logout', logoutUser);
router.get('/me', protect, getMe);

module.exports = router;
