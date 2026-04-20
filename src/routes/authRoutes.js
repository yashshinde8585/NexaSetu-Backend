const express = require('express');
const {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  activateInvitation,
  completeTour,
  refreshAccessToken,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { registerSchema, loginSchema } = require('../validations/authValidation');

const router = express.Router();

router.post('/register', validate(registerSchema), registerUser);
router.post('/login', validate(loginSchema), loginUser);
router.get('/refresh', refreshAccessToken);
router.post('/activate', activateInvitation);
router.get('/logout', logoutUser);

router.get('/me', protect, getMe);
router.patch('/complete-tour', protect, completeTour);

module.exports = router;
