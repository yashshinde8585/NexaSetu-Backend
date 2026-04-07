const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Workspace = require('../models/Workspace');
const mongoose = require('mongoose');
const Invitation = require('../models/Invitation');
const catchAsync = require('../utils/catchAsync');
const { ROLE_MAPPING, mapRole } = require('../utils/authHelpers');

// Helper to validate email format
const isValidEmail = (email) => {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
};

// Manages user authentication, registration, workspace provisioning, and session handling.
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '5d',
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
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

  // 1. Check for missing fields
  if (!name || !email || !password)
    return res.status(400).json({ status: 'fail', message: 'Name, email, and password are required.' });

  // 2. Validate email format
  if (!isValidEmail(email))
    return res.status(400).json({ status: 'fail', message: 'The email address provided is not in a valid format.' });

  // 3. Validate password length
  if (password.length < 8)
    return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters long for security.' });

  // 4. Check for existing user
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
  });

  if (invitation) {
    invitation.status = 'accepted';
    await invitation.save();
  }

  createSendToken(user, 201, res);
});

exports.loginUser = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  if (!email || !password)
    return res.status(400).json({ status: 'fail', message: 'Please provide both email and password.' });

  // Check email format to provide specific feedback
  if (!isValidEmail(email)) {
    return res.status(400).json({ status: 'fail', message: 'Invalid email address format. Please use a valid email.' });
  }

  const user = await User.findOne({ email }).select('+password');
  
  // Specific checks for wrong email vs wrong password
  if (!user) {
    return res.status(401).json({ status: 'fail', message: 'Account not found with this email address.' });
  }

  if (!(await user.comparePassword(password))) {
    return res.status(401).json({ status: 'fail', message: 'Incorrect password. Please verify and try again.' });
  }

  createSendToken(user, 200, res);
});

exports.logoutUser = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

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
