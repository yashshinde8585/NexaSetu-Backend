const express = require('express');
const { registerUser, loginUser, logoutUser, getMe, activateInvitation, completeTour } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/activate', activateInvitation);
router.get('/logout', logoutUser);
router.get('/me', protect, getMe);
router.patch('/complete-tour', protect, completeTour);

module.exports = router;
