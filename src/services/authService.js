const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Invitation = require('../models/Invitation');
const Session = require('../models/Session');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const mongoose = require('mongoose');
const { mapRole } = require('../utils/authHelpers');
const AppError = require('../utils/appError');
const workspaceService = require('./workspaceService');
const metricsService = require('./metricsService');
const logger = require('../utils/logger');
const crypto = require('crypto');

const generateTokens = (userId) => {
  const id = userId.toString();
  const accessToken = jwt.sign({ id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign({ id }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
  return { accessToken, refreshToken };
};

const { runInTransaction } = require('../utils/dbUtils');

const registerUser = async (userData) => {
  const { email, name, admin, password, workspaceName, plan, assignedProjectId } = userData;

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new AppError('This email is already registered.', 400);

  return await runInTransaction(async (session) => {
    const invitation = await Invitation.findOne({ email, status: 'pending' }).session(session);
    let workspaceId, role, jobTitle;

    if (invitation) {
      workspaceId = invitation.workspaceId;
      role = mapRole(invitation.role) || 'PROJECT_MEMBER';
      
      jobTitle = 'Software Engineer';
      const normalizedRole = invitation.role.toUpperCase();
      if (normalizedRole.includes('MANAGER')) jobTitle = 'Engineering Manager';
      else if (normalizedRole.includes('ADMIN')) jobTitle = 'Workspace Administrator';
      else if (normalizedRole.includes('VP')) jobTitle = 'VP Engineering';
      else if (normalizedRole.includes('LEAD')) jobTitle = 'Tech Lead';
      else if (normalizedRole.includes('INTERN')) jobTitle = 'Intern';
      else if (normalizedRole.includes('QA')) jobTitle = 'QA Engineer';
    } else {
      role = 'WORKSPACE_ADMIN';
      jobTitle = userData.jobTitle || (plan?.includes('executive') ? 'Chief Technology Officer' : 'Workspace Administrator');

      const newWorkspace = await workspaceService.provisionWorkspace({
        name: workspaceName || `${name}'s Hub`,
        adminName: admin,
        plan: plan || 'free'
      }, session);
      workspaceId = newWorkspace._id;
    }

    const user = await User.create([{
      name,
      email,
      password,
      role: (invitation ? invitation.role : role),
      jobTitle,
      workspaceId,
      assignedProjectId: (invitation ? invitation.projectId : null) || assignedProjectId,
      passwordChangedAt: Date.now(),
    }], { session });

    const createdUser = user[0];

    if (invitation) {
      invitation.status = 'accepted';
      await invitation.save({ session });
    } else {
      await workspaceService.transferOwnership(workspaceId, createdUser._id, session);
    }

    metricsService.trackEvent(createdUser, 'signup_success', { 
      method: invitation ? 'invitation' : 'direct',
      role: createdUser.role 
    }).catch(err => logger.error(`[METRICS] Failed to track signup: ${err.message}`));

    return createdUser;
  });
};


const loginUser = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw new AppError('Account not found with this email address.', 401);

  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new AppError(`Account locked. Try again in ${minutes} minutes.`, 403);
  }

  if (!(await user.comparePassword(password))) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= config.security.failedLoginLimit) {
      user.lockUntil = new Date(Date.now() + config.security.lockoutDuration * 60 * 1000);
    }
    await user.save({ validateBeforeSave: false });
    
    const remaining = Math.max(0, config.security.failedLoginLimit - (user.failedLoginAttempts || 0));
    throw new AppError(
      user.failedLoginAttempts >= config.security.failedLoginLimit 
        ? `Too many failed attempts. Account locked for ${config.security.lockoutDuration} minutes.` 
        : `Incorrect password. ${remaining} attempts remaining.`, 
      401
    );
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save({ validateBeforeSave: false });

  metricsService.trackEvent(user, 'login_success').catch(err => 
    logger.error(`[METRICS] Failed to track login: ${err.message}`)
  );

  return user;
};

const createSession = async (userId, token, meta) => {
  const expiresAt = new Date(Date.now() + config.security.sessionDurationMs);
  
  await Session.create({
    userId,
    token,
    expiresAt,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress
  });

  const sessions = await Session.find({ userId }).sort({ createdAt: -1 });
  if (sessions.length > config.security.sessionLimit) {
    const toDelete = sessions.slice(config.security.sessionLimit).map(s => s._id);
    await Session.deleteMany({ _id: { $in: toDelete } });
  }
};

const revokeSession = async (token) => {
  await Session.deleteOne({ token });
};

const refreshAccessToken = async (token) => {
  const session = await Session.findOne({ token });
  if (!session) throw new AppError('Invalid or revoked session', 401);

  const decoded = jwt.verify(token, config.jwt.refreshSecret);
  if (decoded.id !== session.userId.toString()) throw new AppError('Identity mismatch', 401);

  const user = await User.findById(session.userId);
  if (!user) throw new AppError('User no longer exists', 401);

  const { accessToken } = generateTokens(user._id);
  return { user, accessToken };
};

const activateInvitation = async (token, name, password) => {
  const invitation = await Invitation.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: Date.now() },
  });
  
  if (!invitation) throw new AppError('Invalid or expired invitation.', 400);

  let jobTitle = 'Software Engineer';
  const normalizedRole = invitation.role.toUpperCase();
  
  if (normalizedRole.includes('MANAGER')) jobTitle = 'Engineering Manager';
  else if (normalizedRole.includes('ADMIN')) jobTitle = 'Workspace Administrator';
  else if (normalizedRole.includes('VP')) jobTitle = 'VP Engineering';
  else if (normalizedRole.includes('LEAD')) jobTitle = 'Tech Lead';
  else if (normalizedRole.includes('INTERN')) jobTitle = 'Intern';
  else if (normalizedRole.includes('QA')) jobTitle = 'QA Engineer';

  const user = await User.create({
    name,
    email: invitation.email,
    password,
    role: invitation.role,
    jobTitle,
    workspaceId: invitation.workspaceId,
    assignedProjectId: invitation.projectId,
  });

  invitation.status = 'accepted';
  await invitation.save();
  return user;
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new AppError('No account found with that email address.', 404);

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  await user.save({ validateBeforeSave: false });
  return resetToken;
};

const resetPassword = async (token, password) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) throw new AppError('Token is invalid or has expired.', 400);

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now();
  
  await user.save();
  return user;
};

const completeTour = async (userId) => {
  const user = await User.findByIdAndUpdate(userId, { hasSeenTour: true }, { new: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

const updateAvatar = async (user, publicUrl) => {
  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    { profilePicture: publicUrl },
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!updatedUser) throw new AppError('User not found', 404);
  return updatedUser;
};

module.exports = {
  registerUser,
  loginUser,
  generateTokens,
  createSession,
  revokeSession,
  refreshAccessToken,
  activateInvitation,
  forgotPassword,
  resetPassword,
  completeTour,
  updateAvatar,
};
