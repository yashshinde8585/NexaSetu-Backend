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
    price: 799,
    priceAnnual: 639,
    globalPrice: 10,
    globalPriceAnnual: 8,
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
    price: 2999,
    priceAnnual: 2399,
    globalPrice: 36,
    globalPriceAnnual: 29,
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
