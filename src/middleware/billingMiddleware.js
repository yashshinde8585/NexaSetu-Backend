const Subscription = require('../models/Subscription');
const { PLANS } = require('../config/plans');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * Middleware to enforce subscription-based feature limits.
 * @param {string} feature - The feature key to check (e.g., 'projects', 'aiUsage')
 * @param {function} getUsage - Optional function to calculate current usage from DB if not cached in subscription
 */
exports.checkLimit = (feature, getUsage = null) => {
  return catchAsync(async (req, res, next) => {
    const workspaceId = req.user.workspaceId;
    
    const subscription = await Subscription.findOne({ workspaceId });
    if (!subscription) {
      return next(new AppError('Active subscription required.', 403));
    }

    const planConfig = PLANS[subscription.plan.toUpperCase()];
    const limit = planConfig.features[feature];

    // If limit is Infinity, bypass check
    if (limit === Infinity) return next();

    let currentUsage;
    if (getUsage) {
      // Dynamic usage check (e.g., counting projects in DB)
      currentUsage = await getUsage(req);
    } else {
      // Use cached usage from subscription document
      currentUsage = subscription.usage[feature] || 0;
    }

    if (currentUsage >= limit) {
      return res.status(403).json({
        status: 'fail',
        code: 'LIMIT_EXCEEDED',
        message: `Plan limit reached for ${feature}. Current: ${currentUsage}, Limit: ${limit}. Please upgrade your plan.`,
        data: {
          feature,
          current: currentUsage,
          limit,
          upgradeRequired: true
        }
      });
    }

    next();
  });
};
