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
  updateAvatar,
} = require('../controllers/authController');
const multer = require('multer');

// Configure Multer for memory storage (for cloud upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  }
});
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
router.patch('/avatar', protect, upload.single('avatar'), updateAvatar);

module.exports = router;
