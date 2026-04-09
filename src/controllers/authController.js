const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const Workspace = require('../models/Workspace');
const mongoose = require('mongoose');
const Invitation = require('../models/Invitation');
const Session = require('../models/Session');
const catchAsync = require('../utils/catchAsync');
const { ROLE_MAPPING, mapRole } = require('../utils/authHelpers');

// Manages user authentication, registration, workspace provisioning, and session handling.
// Helper to generate a short-lived access token for immediate API authorization.
const signAccessToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn, // Tactical short-lived window
  });
};

// Helper to generate a long-lived refresh token stored securely for session continuity.
const signRefreshToken = (id) => {
  return jwt.sign({ id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn, // Strategic long-term window
  });
};

const createSendToken = async (user, statusCode, res) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  // Persistence: Store the refresh token in a dedicated session document.
  await Session.create({
    userId: user._id,
    token: refreshToken,
    expiresAt,
    userAgent: res.req?.headers['user-agent'],
    ipAddress: res.req?.ip
  });
  
  // Optional: Clean up older sessions for this user (Keep last 5)
  const userSessions = await Session.find({ userId: user._id }).sort({ createdAt: -1 });
  if (userSessions.length > 5) {
    const sessionsToRemove = userSessions.slice(5).map(s => s._id);
    await Session.deleteMany({ _id: { $in: sessionsToRemove } });
  }

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
  };

  res.cookie('jwt', accessToken, {
    ...cookieOptions,
    expires: new Date(Date.now() + 15 * 60 * 1000 + 60000), // 16 minutes (access token + buffer)
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    expires: expiresAt,
  });

  // Remove sensitive fields from operational output
  user.password = undefined;
  user.refreshTokens = undefined;

  res.status(statusCode).json({
    status: 'success',
    token: accessToken,
    data: {
      user,
    },
  });
};

exports.registerUser = catchAsync(async (req, res, next) => {
  const {
    name,
    email,
    password,
    role,
    assignedProjectId,
    workspaceName,
    plan,
  } = req.body;

  // Manual validation has been replaced by Zod middleware contracts in authRoutes.js

  // 1. Check for existing user
  const existingUser = await User.findOne({ email });
  if (existingUser)
    return res.status(400).json({ status: 'fail', message: 'This email is already registered. Please try logging in.' });

  const userId = new mongoose.Types.ObjectId();
  let workspaceId;
  let finalRole;
  let finalJobTitle;

  // Resolve the invitation token if the user is joining an existing workspace.
  const invitation = await Invitation.findOne({ email, status: 'pending' });

  if (invitation) {
    workspaceId = invitation.workspaceId;
    finalRole = mapRole(invitation.role) || 'PROJECT_MEMBER';
    finalJobTitle = 'Software Engineer';
  } else {
    // Provision a brand new workspace for a completely new customer.
    finalRole = 'WORKSPACE_ADMIN';
    const finalWorkspaceDisplayName = workspaceName || `${name}'s Hub`;
    finalJobTitle =
      req.body.jobTitle ||
      (plan?.includes('executive')
        ? 'Chief Technology Officer'
        : 'Workspace Administrator');

    const newWorkspace = await Workspace.create({
      name: finalWorkspaceDisplayName,
      admin: userId,
      subscription: { plan: plan || 'free' },
    });
    workspaceId = newWorkspace._id;
  }

  const user = await User.create({
    _id: userId,
    name,
    email,
    password,
    role: finalRole,
    jobTitle: finalJobTitle,
    workspaceId,
    assignedProjectId: (invitation ? invitation.projectId : null) || assignedProjectId,
    passwordChangedAt: Date.now(),
  });

  if (invitation) {
    invitation.status = 'accepted';
    await invitation.save();
  }

  createSendToken(user, 201, res);
});

exports.loginUser = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    return res.status(401).json({ status: 'fail', message: 'Account not found with this email address.' });
  }

  // 1. Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    return res.status(403).json({ 
      status: 'fail', 
      message: `Account is temporarily locked due to multiple failed attempts. Try again in ${Math.ceil((user.lockUntil - Date.now()) / 60000)} minutes.` 
    });
  }

  // 2. Validate password
  if (!(await user.comparePassword(password))) {
    // Increment failed attempts
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    
    if (user.failedLoginAttempts >= 5) {
      user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minute lock
      await user.save({ validateBeforeSave: false });
      return res.status(403).json({ status: 'fail', message: 'Too many failed attempts. Account locked for 30 minutes.' });
    }
    
    await user.save({ validateBeforeSave: false });
    return res.status(401).json({ status: 'fail', message: `Incorrect password. ${5 - user.failedLoginAttempts} attempts remaining.` });
  }

  // 3. Reset failed attempts on success
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save({ validateBeforeSave: false });

  createSendToken(user, 200, res);
});

exports.logoutUser = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (refreshToken) {
    // Revoke the specific tactical refresh token from the database
    await Session.deleteOne({ token: refreshToken });
  }

  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.cookie('refreshToken', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

exports.refreshAccessToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    return res.status(401).json({ status: 'fail', message: 'No refresh token provided' });
  }

  // 1. Verify existence of the token in our session registry
  const session = await Session.findOne({ token: refreshToken });
  if (!session) {
    return res.status(401).json({ status: 'fail', message: 'Invalid refresh token or session revoked' });
  }

  const user = await User.findById(session.userId);
  if (!user) {
    return res.status(401).json({ status: 'fail', message: 'User no longer exists' });
  }

  // 2. Validate token signature and expiration
  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    
    if (decoded.id !== user._id.toString()) {
      throw new Error('Identity mismatch');
    }

    // 3. Optional: Implement Refresh Token Rotation (Recommended for high security)
    // For now, we'll just issue a new Access Token
    const accessToken = signAccessToken(user._id);

    res.cookie('jwt', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      expires: new Date(Date.now() + 15 * 60 * 1000),
    });

    res.status(200).json({
      status: 'success',
      token: accessToken,
    });
  } catch (err) {
    // If token is invalid/expired, purge it from session collection
    await Session.deleteOne({ token: refreshToken });
    return res.status(401).json({ status: 'fail', message: 'Refresh token expired or invalid' });
  }
});

exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

exports.activateInvitation = catchAsync(async (req, res, next) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password)
    return res.status(400).json({ status: 'fail', message: 'Missing activation data.' });

  const invitation = await Invitation.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: Date.now() },
  });
  
  if (!invitation)
    return res.status(400).json({ status: 'fail', message: 'Invalid or expired invitation.' });

  const user = await User.create({
    name,
    email: invitation.email,
    password,
    role: mapRole(invitation.role),
    jobTitle: (invitation.role === 'INTERN' ? 'Intern' : 'Software Engineer'),
    workspaceId: invitation.workspaceId,
    assignedProjectId: invitation.projectId,
  });

  invitation.status = 'accepted';
  await invitation.save();

  createSendToken(user, 201, res);
});

exports.completeTour = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { hasSeenTour: true },
    { new: true }
  );
  res.status(200).json({
    status: 'success',
    data: { user },
  });
});
