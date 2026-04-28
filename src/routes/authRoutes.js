const express = require('express');
/**
 * Authentication & Identity Management Routes
 * Handles user lifecycle, session rotation, and security gatekeeping.
 */
const {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  activateInvitation,
  completeTour,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { registerSchema, loginSchema } = require('../validations/authValidation');
const { honeypot } = require('../middleware/botMiddleware');

const router = express.Router();

router.post('/register', honeypot, validate(registerSchema), registerUser);
router.post('/login', honeypot, validate(loginSchema), loginUser);
router.get('/refresh', refreshAccessToken);
router.post('/activate', activateInvitation);
router.get('/logout', logoutUser);

router.post('/forgot-password', forgotPassword);
router.patch('/reset-password/:token', resetPassword);

router.get('/me', protect, getMe);
router.patch('/complete-tour', protect, completeTour);

module.exports = router;
