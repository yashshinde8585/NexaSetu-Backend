const { Webhook } = require('svix');
const User = require('../models/User');
const workspaceService = require('../services/workspaceService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const config = require('../config/config');

exports.handleClerkWebhook = catchAsync(async (req, res, next) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env');
  }

  // Get the headers
  const svix_id = req.headers['svix-id'];
  const svix_timestamp = req.headers['svix-timestamp'];
  const svix_signature = req.headers['svix-signature'];

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return next(new AppError('No svix headers', 400));
  }

  // Get the body (use rawBody if available, fallback to stringified body)
  const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;

  // Attempt to verify the incoming webhook
  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    logger.error('Error verifying webhook:', err.message);
    return next(new AppError('Error verifying webhook', 400));
  }

  const { id } = evt.data;
  const eventType = evt.type;

  logger.info(`Webhook received. ID: ${id}, Type: ${eventType}`);

  if (eventType === 'user.created') {
    const { id: clerkUserId, email_addresses, first_name, last_name, unsafe_metadata } = evt.data;
    const email = email_addresses[0].email_address;
    const name = `${first_name || ''} ${last_name || ''}`.trim();
    
    logger.info(`[CLERK WEBHOOK] Processing user.created for ${email} (${clerkUserId})`);
    
    // Check if user already exists
    let user = await User.findOne({ email });
    
    if (user) {
      logger.info(`[CLERK WEBHOOK] User ${email} already exists, updating clerkUserId`);
      user.clerkUserId = clerkUserId;
      await user.save();
    } else {
      logger.info(`[CLERK WEBHOOK] Creating new user and workspace for ${email}`);
      const { workspaceName, admin, plan } = unsafe_metadata || {};
      
      const newUserData = {
        name: name || email.split('@')[0],
        email,
        password: 'CLERK_MANAGED',
        clerkUserId,
        role: 'WORKSPACE_ADMIN',
        workspaceName,
        admin,
        plan
      };

      const authService = require('../services/authService');
      await authService.registerUser(newUserData);
      logger.info(`[CLERK WEBHOOK] Successfully registered user and provisioned workspace for ${email}`);
    }
  }

  if (eventType === 'user.updated') {
    const { id: clerkUserId, first_name, last_name, image_url } = evt.data;
    await User.findOneAndUpdate(
      { clerkUserId },
      { 
        name: `${first_name || ''} ${last_name || ''}`.trim(),
        profilePicture: image_url 
      }
    );
  }

  if (eventType === 'user.deleted') {
    const { id: clerkUserId } = evt.data;
    await User.findOneAndUpdate({ clerkUserId }, { status: 'Deactivated' });
  }

  res.status(200).json({
    success: true,
    message: 'Webhook processed successfully',
  });
});
