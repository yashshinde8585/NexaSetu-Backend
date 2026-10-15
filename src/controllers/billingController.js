const Subscription = require('../models/Subscription');
const { PLANS } = require('../config/plans');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

// Retrieve all available plans and their metadata
exports.getPlans = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: { plans: Object.values(PLANS) },
  });
};

// Simulate a dummy checkout and activate a subscription instantly
exports.selectPlan = catchAsync(async (req, res, next) => {
  const { plan, workspaceId } = req.body;
  const planKey = plan.toUpperCase();

  if (!PLANS[planKey]) {
    return next(new AppError('Invalid plan selected', 400));
  }

  // Find existing subscription or create a new one
  let subscription = await Subscription.findOne({ workspaceId });

  if (subscription) {
    subscription.plan = plan.toLowerCase();
    subscription.status = 'active';
    subscription.startDate = new Date();
    // In a real scenario, this would handle pro-rated billing
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      userId: req.user._id,
      workspaceId,
      plan: plan.toLowerCase(),
      status: 'active',
      startDate: new Date(),
    });
  }

  logger.info(
    `[BILLING] Plan activated: workspace=${workspaceId} plan=${plan}`
  );

  res.status(200).json({
    status: 'success',
    data: { subscription },
  });
});

// Get current subscription details including feature limits and usage
exports.getSubscription = catchAsync(async (req, res, next) => {
  const workspaceId = req.user.workspaceId;

  const subscription = await Subscription.findOne({ workspaceId });

  if (!subscription) {
    return res.status(200).json({
      status: 'success',
      data: {
        subscription: null,
        limits: null,
        planName: 'No Active Plan',
      },
    });
  }

  const planConfig = PLANS[subscription.plan.toUpperCase()];

  res.status(200).json({
    status: 'success',
    data: {
      subscription,
      limits: planConfig.features,
      planName: planConfig.name,
    },
  });
});

// Cancel subscription - no longer auto-reverts to Free
exports.cancelSubscription = catchAsync(async (req, res, next) => {
  const workspaceId = req.user.workspaceId;

  const subscription = await Subscription.findOneAndUpdate(
    { workspaceId },
    {
      status: 'canceled',
      cancelAtPeriodEnd: false,
    },
    { new: true }
  );

  if (!subscription) {
    return next(new AppError('No active subscription found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Subscription canceled.',
    data: { subscription },
  });
});
