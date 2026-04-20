const authService = require('../services/authService');
const catchAsync = require('../utils/catchAsync');
const config = require('../config/config');

const cookieOptions = config.jwt.cookieOptions;

const sendAuthResponse = async (user, statusCode, req, res) => {
  const { accessToken, refreshToken } = authService.generateTokens(user._id);

  await authService.createSession(user._id, refreshToken, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  res.cookie('jwt', accessToken, {
    ...cookieOptions,
    expires: new Date(Date.now() + 15 * 60 * 1000 + 60000), // 16 min
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
  });

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token: accessToken,
    data: { user },
  });
};

// Register a new user and return auth tokens
exports.registerUser = catchAsync(async (req, res, next) => {
  const user = await authService.registerUser(req.body);
  await sendAuthResponse(user, 201, req, res);
});

// Authenticate user credentials and return auth tokens
exports.loginUser = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  const user = await authService.loginUser(email, password);
  await sendAuthResponse(user, 200, req, res);
});

// Log out user by clearing cookies and revoking session
exports.logoutUser = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) await authService.revokeSession(refreshToken);

  const clearOptions = { ...cookieOptions, expires: new Date(Date.now() + 1000) };
  res.cookie('jwt', 'loggedout', clearOptions);
  res.cookie('refreshToken', 'loggedout', clearOptions);

  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

// Refresh access token using a valid refresh token
exports.refreshAccessToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) return res.status(401).json({ status: 'fail', message: 'Session expired' });

  try {
    const { accessToken } = await authService.refreshAccessToken(refreshToken);
    
    res.cookie('jwt', accessToken, {
      ...cookieOptions,
      expires: new Date(Date.now() + 15 * 60 * 1000),
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

// Mark the onboarding tour as completed for the user
exports.completeTour = catchAsync(async (req, res, next) => {
  const user = await authService.completeTour(req.user._id);
  res.status(200).json({ status: 'success', data: { user } });
});
