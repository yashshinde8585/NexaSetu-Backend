/**
 * Plan Configuration - Centralized Pricing Tiers
 * Standardizes feature limits and billing metadata across the system.
 */
const PLANS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceAnnual: 0,
    globalPrice: 0,
    globalPriceAnnual: 0,
    features: {
      projects: 2,
      sprints: 5,
      users: 3,
      aiUsage: 100,
    },
    description: 'Perfect for solo developers and small side projects.',
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    price: 1999,
    priceAnnual: 1599,
    globalPrice: 29,
    globalPriceAnnual: 24,
    features: {
      projects: 20,
      sprints: 50,
      users: 15,
      aiUsage: 1500,
    },
    description: 'Advanced features for growing teams and serious engineering.',
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 9999,
    priceAnnual: 7999,
    globalPrice: 149,
    globalPriceAnnual: 119,
    features: {
      projects: Infinity,
      sprints: Infinity,
      users: Infinity,
      aiUsage: Infinity,
    },
    description: 'Maximum scale, priority support, and unlimited intelligence.',
  },
};

module.exports = { PLANS };
