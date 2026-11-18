const billingController = require('../src/controllers/billingController');
const Subscription = require('../src/models/Subscription');
const User = require('../src/models/User');
const Project = require('../src/models/Project');
const Sprint = require('../src/models/Sprint');
const Invitation = require('../src/models/Invitation');

jest.mock('../src/models/Subscription');
jest.mock('../src/models/User');
jest.mock('../src/models/Project');
jest.mock('../src/models/Sprint');
jest.mock('../src/models/Invitation');

describe('billingController.getSubscription Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return subscription details with verified workspace usage metrics', async () => {
    const mockSubscription = {
      _id: 'sub-1',
      workspaceId: 'ws-100',
      plan: 'enterprise',
      status: 'active',
      startDate: new Date('2026-01-01'),
      usage: { aiUsage: 120 },
      toObject: function () {
        return {
          _id: this._id,
          workspaceId: this.workspaceId,
          plan: this.plan,
          status: this.status,
          startDate: this.startDate,
          usage: { ...this.usage },
        };
      },
    };

    Subscription.findOne.mockResolvedValue(mockSubscription);
    User.countDocuments.mockResolvedValue(2);
    Invitation.countDocuments.mockResolvedValue(1);
    Project.countDocuments.mockResolvedValue(5);
    Sprint.countDocuments.mockResolvedValue(8);

    const mockReq = {
      user: {
        _id: 'user-1',
        workspaceId: 'ws-100',
      },
    };

    let statusCode;
    let responseBody;
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => {
            responseBody = body;
          },
        };
      },
    };
    const mockNext = jest.fn();

    await billingController.getSubscription(mockReq, mockRes, mockNext);

    expect(statusCode).toBe(200);
    expect(responseBody.status).toBe('success');
    expect(responseBody.data.subscription).toBeDefined();
    expect(responseBody.data.subscription.plan).toBe('enterprise');
    expect(responseBody.data.planName).toBe('Enterprise');

    // Verified usage counts
    expect(responseBody.data.usage.users).toBe(3); // 2 active + 1 pending
    expect(responseBody.data.usage.activeUsers).toBe(2);
    expect(responseBody.data.usage.pendingInvites).toBe(1);
    expect(responseBody.data.usage.projects).toBe(5);
    expect(responseBody.data.usage.sprints).toBe(8);
    expect(responseBody.data.usage.aiUsage).toBe(120);

    // Verified limits
    expect(responseBody.data.limits).toBeDefined();
    expect(responseBody.data.limits.projects).toBe(Infinity);
  });

  it('should return No Active Plan when workspace subscription does not exist', async () => {
    Subscription.findOne.mockResolvedValue(null);

    const mockReq = {
      user: {
        _id: 'user-2',
        workspaceId: 'ws-empty',
      },
    };

    let statusCode;
    let responseBody;
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => {
            responseBody = body;
          },
        };
      },
    };
    const mockNext = jest.fn();

    await billingController.getSubscription(mockReq, mockRes, mockNext);

    expect(statusCode).toBe(200);
    expect(responseBody.status).toBe('success');
    expect(responseBody.data.subscription).toBeNull();
    expect(responseBody.data.planName).toBe('No Active Plan');
  });
});
