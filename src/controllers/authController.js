const authService = require('../services/authService');
const catchAsync = require('../utils/catchAsync');
const config = require('../config/config');
const logger = require('../utils/logger');
const { monitorClientStatus } = require('../utils/requestGuard');

const cookieOptions = config.jwt.cookieOptions;

const sendAuthResponse = async (user, statusCode, req, res) => {
  const { accessToken, refreshToken } = authService.generateTokens(user._id);

  await authService.createSession(user._id, refreshToken, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  res.cookie('jwt', accessToken, {
    ...cookieOptions,
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token: accessToken,
    data: { user },
  });
};

// Initialize auth state by verifying credentials and establishing a persistent session
exports.registerUser = catchAsync(async (req, res, next) => {
  // Monitor if client disconnects to prevent expensive database operations for abandoned requests
  const guard = monitorClientStatus(req);
  
  const user = await authService.registerUser(req.body);
  
  guard.throwIfAborted();
  await sendAuthResponse(user, 201, req, res);
});

// Verify identity and establish a secure, versioned session link
exports.loginUser = catchAsync(async (req, res, next) => {
  const guard = monitorClientStatus(req);
  const { email, password } = req.body;
  
  const user = await authService.loginUser(email, password);
  
  guard.throwIfAborted();
  await sendAuthResponse(user, 200, req, res);
});

// Terminate session and invalidate client-side authentication tokens immediately
exports.logoutUser = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) await authService.revokeSession(refreshToken);

  const clearOptions = { ...cookieOptions, expires: new Date(Date.now() + 1000) };
  res.cookie('jwt', 'loggedout', clearOptions);
  res.cookie('refreshToken', 'loggedout', clearOptions);

  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

// Rotate access tokens to maintain session continuity without requiring re-login
exports.refreshAccessToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) return res.status(401).json({ status: 'fail', message: 'Session expired' });

  try {
    const { accessToken } = await authService.refreshAccessToken(refreshToken);
    
    res.cookie('jwt', accessToken, {
      ...cookieOptions,
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    res.status(200).json({ status: 'success', token: accessToken });
  } catch (err) {
    if (refreshToken) await authService.revokeSession(refreshToken);
    res.status(401).json({ status: 'fail', message: 'Invalid session' });
  }
});

// Get currently authenticated user's profile
exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: { user: req.user },
  });
});

// Accept invitation and create associated user account
exports.activateInvitation = catchAsync(async (req, res, next) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) {
    return res.status(400).json({ status: 'fail', message: 'Missing activation data.' });
  }

  const user = await authService.activateInvitation(token, name, password);
  await sendAuthResponse(user, 201, req, res);
});

// Initiate password recovery by generating a secure reset token
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const resetToken = await authService.forgotPassword(req.body.email);

  // MOCK: In production, send email here
  logger.info(`[MOCK EMAIL] Password reset token for ${req.body.email}: ${resetToken}`);

  res.status(200).json({
    status: 'success',
    message: 'Token sent to email (Mocked in logs)',
  });
});

// Finalize password recovery by validating token and applying new credentials
exports.resetPassword = catchAsync(async (req, res, next) => {
  const user = await authService.resetPassword(req.params.token, req.body.password);
  await sendAuthResponse(user, 200, req, res);
});

// Mark the onboarding tour as completed for the user
exports.completeTour = catchAsync(async (req, res, next) => {
  const user = await authService.completeTour(req.user._id);
  res.status(200).json({ status: 'success', data: { user } });
});
