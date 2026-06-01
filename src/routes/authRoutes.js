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
  changePassword,
} = require('../controllers/authController');
const multer = require('multer');

// Configure Multer for memory storage (for cloud upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  },
});
const { protect } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { registerSchema, loginSchema } = require('../validators/authValidation');
const { honeypot } = require('../middlewares/botMiddleware');

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input
 */
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Auto-generated summary for POST /auth/register
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/register', honeypot, validate(registerSchema), registerUser);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Auto-generated summary for POST /auth/login
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/login', honeypot, validate(loginSchema), loginUser);
/**
 * @swagger
 * /auth/refresh:
 *   get:
 *     summary: Auto-generated summary for GET /auth/refresh
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/refresh', refreshAccessToken);
/**
 * @swagger
 * /auth/activate:
 *   post:
 *     summary: Auto-generated summary for POST /auth/activate
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/activate', activateInvitation);
/**
 * @swagger
 * /auth/logout:
 *   get:
 *     summary: Auto-generated summary for GET /auth/logout
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/logout', logoutUser);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Auto-generated summary for POST /auth/forgot-password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/forgot-password', forgotPassword);
/**
 * @swagger
 * /auth/reset-password/{token}:
 *   patch:
 *     summary: Auto-generated summary for PATCH /auth/reset-password/{token}
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch('/reset-password/:token', resetPassword);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Auto-generated summary for GET /auth/me
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get('/me', protect, getMe);
/**
 * @swagger
 * /auth/complete-tour:
 *   patch:
 *     summary: Auto-generated summary for PATCH /auth/complete-tour
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch('/complete-tour', protect, completeTour);
/**
 * @swagger
 * /auth/avatar:
 *   patch:
 *     summary: Auto-generated summary for PATCH /auth/avatar
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch('/avatar', protect, upload.single('avatar'), updateAvatar);
/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     summary: Auto-generated summary for PATCH /auth/change-password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch('/change-password', protect, changePassword);

module.exports = router;
