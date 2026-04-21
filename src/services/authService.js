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

class AuthService {
  // Register user and provision workspace or join via invitation (Atomic)
  async registerUser(userData) {
    try {
      const { email, name, admin, password, workspaceName, plan, assignedProjectId } = userData;

      const existingUser = await User.findOne({ email });
      if (existingUser) throw new AppError('This email is already registered.', 400);

      const invitation = await Invitation.findOne({ email, status: 'pending' });
      let workspaceId, role, jobTitle;

      if (invitation) {
        workspaceId = invitation.workspaceId;
        role = mapRole(invitation.role) || 'PROJECT_MEMBER';
        
        // Map roles to appropriate professional job titles
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
        });
        workspaceId = newWorkspace._id;
      }

      const user = await User.create([{
        name,
        email,
        password,
        role: (invitation ? invitation.role : role), // Use specific role if invited
        jobTitle,
        workspaceId,
        assignedProjectId: (invitation ? invitation.projectId : null) || assignedProjectId,
        passwordChangedAt: Date.now(),
      }]);

      const createdUser = user[0];

      if (invitation) {
        invitation.status = 'accepted';
        await invitation.save();
      } else {
        await workspaceService.transferOwnership(workspaceId, createdUser._id);
      }

      return createdUser;
    } catch (error) {
      throw error;
    }
  }

  // Authenticate user and manage login security thresholds
  async loginUser(email, password) {
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
    return user;
  }

  // Generate standard access and refresh token pair
  generateTokens(userId) {
    const accessToken = jwt.sign({ id: userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    const refreshToken = jwt.sign({ id: userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
    return { accessToken, refreshToken };
  }

  // Persist session and enforce concurrent session limits
  async createSession(userId, token, meta) {
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
  }

  // Remove session and revoke refresh token
  async revokeSession(token) {
    await Session.deleteOne({ token });
  }

  // Exchange valid refresh token for a new access token
  async refreshAccessToken(token) {
    const session = await Session.findOne({ token });
    if (!session) throw new AppError('Invalid or revoked session', 401);

    const decoded = jwt.verify(token, config.jwt.refreshSecret);
    if (decoded.id !== session.userId.toString()) throw new AppError('Identity mismatch', 401);

    const user = await User.findById(session.userId);
    if (!user) throw new AppError('User no longer exists', 401);

    const { accessToken } = this.generateTokens(user._id);
    return { user, accessToken };
  }

  // Accept pending invitation and provision new account
  async activateInvitation(token, name, password) {
    const invitation = await Invitation.findOne({
      token,
      status: 'pending',
      expiresAt: { $gt: Date.now() },
    });
    
    if (!invitation) throw new AppError('Invalid or expired invitation.', 400);

    // Map roles to appropriate professional job titles
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
      role: invitation.role, // Preserve specific role for frontend routing
      jobTitle,
      workspaceId: invitation.workspaceId,
      assignedProjectId: invitation.projectId,
    });

    invitation.status = 'accepted';
    await invitation.save();
    return user;
  }
  // Mark user tour as completed
  async completeTour(userId) {
    const user = await User.findByIdAndUpdate(userId, { hasSeenTour: true }, { new: true });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }
}

module.exports = new AuthService();
