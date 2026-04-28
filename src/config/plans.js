/**
 * Plan Configuration - Centralized Pricing Tiers
 * Standardizes feature limits and billing metadata across the system.
 */
const PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    features: {
      projects: 2,
      users: 2,
      aiUsage: 100, // Monthly prompt limit
      sprints: 5,
    },
    description: 'Perfect for solo developers and small side projects.',
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    price: 499,
    features: {
      projects: 20,
      users: 10,
      aiUsage: 1000,
      sprints: 50,
    },
    description: 'Advanced features for growing teams and serious engineering.',
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 2499,
    features: {
      projects: Infinity,
      users: Infinity,
      aiUsage: Infinity,
      sprints: Infinity,
    },
    description: 'Maximum scale, priority support, and unlimited intelligence.',
  },
};

module.exports = { PLANS };
