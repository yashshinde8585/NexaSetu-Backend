const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const mockVerifyToken = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@clerk/clerk-sdk-node', () => ({
  createClerkClient: () => ({
    verifyToken: mockVerifyToken,
    users: {
      getUser: mockGetUser,
    },
  }),
}));

const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Subscription = require('../src/models/Subscription');
const { protect } = require('../src/middlewares/authMiddleware');
const { connectRedis, getRedisClient, getBullRedisClient } = require('../src/config/redis');

// Helper to make RS256-style JWTs that authMiddleware identifies as Clerk tokens
const makeClerkToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'mock_clerk_kid', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, jti: `${Date.now()}_${Math.random()}` })).toString('base64url');
  const sig = Buffer.from('mock_signature').toString('base64url');
  return `${header}.${body}.${sig}`;
};

describe('Clerk Authentication & Just-In-Time (JIT) Auto-Provisioning Tests', () => {
  let originalUseClerk;

  beforeAll(async () => {
    originalUseClerk = process.env.USE_CLERK_AUTH;
    process.env.USE_CLERK_AUTH = 'true';

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_LOCAL_URI);
    }
    const { redisClient } = await connectRedis();
    if (redisClient.status !== 'ready') {
      await new Promise((resolve) => redisClient.once('ready', resolve));
    }
  });

  afterAll(async () => {
    process.env.USE_CLERK_AUTH = originalUseClerk;
    await User.deleteMany({
      email: {
        $in: [
          'knownclerk@example.com',
          'emailmatch@example.com',
          'newengineer@example.com',
        ],
      },
    });
    const redis = getRedisClient();
    const bull = getBullRedisClient();
    if (redis) await redis.quit();
    if (bull) await bull.quit();
    await mongoose.connection.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Scenario 1: Authenticates user when clerkUserId is already present in DB', async () => {
    const testWs = await Workspace.create({
      name: 'Known Workspace',
      adminName: 'Known Admin',
      subscription: { plan: 'pro', status: 'active' },
    });

    const knownUser = await User.create({
      name: 'Known User',
      email: 'knownclerk@example.com',
      password: 'randomPassword123!',
      clerkUserId: 'clerk_user_123',
      role: 'WORKSPACE_ADMIN',
      workspaceId: testWs._id,
    });

    const token = makeClerkToken({ sub: 'clerk_user_123' });
    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk_user_123' });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user._id.toString()).toBe(knownUser._id.toString());
    expect(req.user.email).toBe('knownclerk@example.com');
  });

  it('Scenario 2: Links clerkUserId when user exists by email but clerkUserId was missing', async () => {
    const testWs = await Workspace.create({
      name: 'Email Match Workspace',
      adminName: 'Email Match',
      subscription: { plan: 'enterprise', status: 'active' },
    });

    const userWithOnlyEmail = await User.create({
      name: 'Email Match',
      email: 'emailmatch@example.com',
      password: 'randomPassword123!',
      role: 'WORKSPACE_ADMIN',
      workspaceId: testWs._id,
    });

    const token = makeClerkToken({ sub: 'clerk_user_email_match' });
    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk_user_email_match' });
    mockGetUser.mockResolvedValueOnce({
      id: 'clerk_user_email_match',
      firstName: 'Email',
      lastName: 'Match',
      emailAddresses: [{ emailAddress: 'emailmatch@example.com' }],
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('emailmatch@example.com');

    // Confirm DB now stores clerkUserId
    const updated = await User.findById(userWithOnlyEmail._id);
    expect(updated.clerkUserId).toBe('clerk_user_email_match');
  });

  it('Scenario 3: JIT auto-provisions user, workspace, and active subscription when brand new', async () => {
    const token = makeClerkToken({ sub: 'clerk_user_brand_new' });
    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk_user_brand_new' });
    mockGetUser.mockResolvedValueOnce({
      id: 'clerk_user_brand_new',
      firstName: 'New',
      lastName: 'Engineer',
      emailAddresses: [{ emailAddress: 'newengineer@example.com' }],
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('newengineer@example.com');
    expect(req.user.clerkUserId).toBe('clerk_user_brand_new');
    expect(req.user.role).toBe('WORKSPACE_ADMIN');
    expect(req.user.workspaceId).toBeDefined();

    // Verify Workspace exists
    const ws = await Workspace.findById(req.user.workspaceId);
    expect(ws).toBeDefined();
    expect(ws.name).toContain('New Engineer');

    // Verify Subscription exists so billing check does not redirect
    const sub = await Subscription.findOne({ workspaceId: req.user.workspaceId });
    expect(sub).toBeDefined();
    expect(sub.status).toBe('active');
  });
});
