const authService = require('../services/authService');
const storageService = require('../services/storageService');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const config = require('../config/config');
const logger = require('../utils/logger');
const ResponseBuilder = require('../utils/responseBuilder');
const { monitorClientStatus } = require('../utils/requestGuard');

const cookieOptions = config.jwt.cookieOptions;

// Generates tokens, creates a session, and sets secure HTTP-only cookies.
const sendAuthResponse = async (user, statusCode, req, res) => {
  const { accessToken, refreshToken } = authService.generateTokens(user._id);

  await authService.createSession(user._id, refreshToken, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  // Clear maxAge from generic options to avoid conflicts with explicit expires
  const baseOptions = { ...cookieOptions };
  delete baseOptions.maxAge;

  res.cookie('jwt', accessToken, {
    ...baseOptions,
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
  });

  res.cookie('refreshToken', refreshToken, {
    ...baseOptions,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  user.password = undefined;

  return res.status(statusCode).json({
    success: true,
    status: 'success',
    token: accessToken,
    data: { user },
  });
};

exports.registerUser = catchAsync(async (req, res, next) => {
  const guard = monitorClientStatus(req);
  const user = await authService.registerUser(req.body);
  
  guard.throwIfAborted();
  await sendAuthResponse(user, 201, req, res);
});

exports.loginUser = catchAsync(async (req, res, next) => {
  const guard = monitorClientStatus(req);
  const { email, password } = req.body;
  
  const user = await authService.loginUser(email, password);
  
  guard.throwIfAborted();
  await sendAuthResponse(user, 200, req, res);
});

exports.logoutUser = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) await authService.revokeSession(refreshToken);

  const clearOptions = { ...cookieOptions, expires: new Date(Date.now() + 1000) };
  res.cookie('jwt', 'loggedout', clearOptions);
  res.cookie('refreshToken', 'loggedout', clearOptions);

  return ResponseBuilder.success(res, null, 200, 'Logged out successfully');
});

// Rotates access tokens to maintain session continuity without requiring re-login.
exports.refreshAccessToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) return ResponseBuilder.error(res, 'Session expired', 'SESSION_EXPIRED', 401);

  try {
    const { accessToken } = await authService.refreshAccessToken(refreshToken);
    
    res.cookie('jwt', accessToken, {
      ...cookieOptions,
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      success: true,
      status: 'success',
      token: accessToken
    });
  } catch (err) {
    if (refreshToken) await authService.revokeSession(refreshToken);
    return ResponseBuilder.error(res, 'Invalid session', 'INVALID_SESSION', 401);
  }
});

exports.getMe = catchAsync(async (req, res, next) => {
  return ResponseBuilder.success(res, { user: req.user });
});

exports.activateInvitation = catchAsync(async (req, res, next) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) {
    return ResponseBuilder.error(res, 'Missing activation data.', 'MISSING_DATA', 400);
  }

  const user = await authService.activateInvitation(token, name, password);
  await sendAuthResponse(user, 201, req, res);
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const resetToken = await authService.forgotPassword(req.body.email);
  logger.info(`[MOCK EMAIL] Password reset token for ${req.body.email}: ${resetToken}`);

  return ResponseBuilder.success(res, null, 200, 'Token sent to email (Mocked in logs)');
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const user = await authService.resetPassword(req.params.token, req.body.password);
  await sendAuthResponse(user, 200, req, res);
});

exports.completeTour = catchAsync(async (req, res, next) => {
  const user = await authService.completeTour(req.user._id);
  return ResponseBuilder.success(res, { user });
});

exports.updateAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return ResponseBuilder.error(res, 'No image file provided.', 'MISSING_FILE', 400);
  }

  const publicUrl = await storageService.uploadFile(
    req.file.buffer,
    req.file.originalname
  );

  if (req.user.profilePicture) {
    await storageService.deleteFile(req.user.profilePicture).catch(err => {
      logger.error(`[AVATAR_CLEANUP_ERROR]: ${err.message}`);
    });
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { profilePicture: publicUrl },
    { new: true, runValidators: true }
  ).select('-password');

  return ResponseBuilder.success(res, { user: updatedUser }, 200, 'Profile picture updated successfully');
});
