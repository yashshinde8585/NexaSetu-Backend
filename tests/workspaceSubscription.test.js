const mongoose = require('mongoose');
const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Subscription = require('../src/models/Subscription');
const authService = require('../src/services/authService');
const billingController = require('../src/controllers/billingController');
const { connectRedis, getRedisClient, getBullRedisClient } = require('../src/config/redis');

describe('Workspace & Subscription Lifecycle Tests', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_LOCAL_URI);
    }
    const { redisClient } = await connectRedis();
    if (redisClient.status !== 'ready') {
      await new Promise((resolve) => redisClient.once('ready', resolve));
    }
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $in: ['workspace.test@example.com', 'duptest@example.com'] } });
    await Workspace.deleteMany({ name: { $in: ["Test User's Hub", 'NexaSetu Unique Hub'] } });
    const redis = getRedisClient();
    const bull = getBullRedisClient();
    if (redis) await redis.quit();
    if (bull) await bull.quit();
    await mongoose.connection.close();
  });

  it('should register a new user, create a workspace, and automatically issue an active subscription', async () => {
    const userData = {
      name: 'Test User',
      email: 'workspace.test@example.com',
      password: 'SecurePassword123!',
      workspaceName: "Test User's Hub",
      plan: 'pro',
    };

    const user = await authService.registerUser(userData);

    expect(user).toBeDefined();
    expect(user.email).toBe('workspace.test@example.com');
    expect(user.workspaceId).toBeDefined();

    // Verify workspace was provisioned
    const ws = await Workspace.findById(user.workspaceId);
    expect(ws).toBeDefined();
    expect(ws.name).toBe("Test User's Hub");
    expect(ws.admin.toString()).toBe(user._id.toString());

    // Verify subscription was created and is active
    const sub = await Subscription.findOne({ workspaceId: user.workspaceId });
    expect(sub).toBeDefined();
    expect(sub.status).toBe('active');
    expect(sub.plan).toBe('pro');
    expect(sub.userId.toString()).toBe(user._id.toString());

    // Verify getSubscription controller returns the plan correctly
    const mockReq = {
      user: {
        _id: user._id,
        workspaceId: user.workspaceId,
      },
    };
    let responseStatus, responseBody;
    const mockRes = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => {
            responseBody = body;
          },
        };
      },
    };
    const mockNext = jest.fn();

    await billingController.getSubscription(mockReq, mockRes, mockNext);

    expect(responseStatus).toBe(200);
    expect(responseBody.status).toBe('success');
    expect(responseBody.data.subscription).toBeDefined();
    expect(responseBody.data.subscription.plan).toBe('pro');
    expect(responseBody.data.limits.projects).toBe(20);
    expect(responseBody.data.limits.aiUsage).toBe(1500);
  });

  it('should reject registration of duplicate email addresses', async () => {
    const userData = {
      name: 'Dup User 1',
      email: 'duptest@example.com',
      password: 'Password123!',
      plan: 'free',
    };

    await authService.registerUser(userData);

    // Attempt to register with the same email
    let error;
    try {
      await authService.registerUser({
        name: 'Dup User 2',
        email: 'duptest@example.com',
        password: 'Password456!',
        plan: 'enterprise',
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('already registered');
  });
});
