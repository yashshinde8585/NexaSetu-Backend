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

// Test the socket authentication logic directly to isolate WebSocket handshake behavior
const createSocketAuthMiddleware = () => {
  return async (socket, next) => {
    try {
      const useClerk = process.env.USE_CLERK_AUTH === 'true';
      const authHeader =
        socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      const finalToken = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

      if (!finalToken) {
        return next(new Error('Authentication failed: Missing token'));
      }

      if (useClerk) {
        const { createClerkClient } = require('@clerk/clerk-sdk-node');
        const clerkClient = createClerkClient({ secretKey: 'mock_key' });
        const verified = await clerkClient.verifyToken(finalToken);
        const userId = verified.sub;

        let user = await User.findOne({ clerkUserId: userId }).select(
          '_id workspaceId role jobTitle'
        );

        if (!user) {
          const clerkUser = await clerkClient.users.getUser(userId);
          const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
          if (email) {
            user = await User.findOne({ email }).select(
              '_id workspaceId role jobTitle'
            );
            if (user) {
              user.clerkUserId = userId;
              await user.save();
            }
          }
        }

        if (!user) {
          return next(
            new Error('Authentication failed: Profile synchronization pending')
          );
        }

        socket.user = {
          id: user._id,
          workspaceId: user.workspaceId,
          role: user.role,
          jobTitle: user.jobTitle,
        };
        return next();
      }
    } catch (err) {
      return next(new Error(`Authentication failed: ${err.message}`));
    }
  };
};

describe('WebSocket Authentication & Handshake Tests', () => {
  let originalUseClerk;
  let socketAuth;

  beforeAll(async () => {
    originalUseClerk = process.env.USE_CLERK_AUTH;
    process.env.USE_CLERK_AUTH = 'true';
    socketAuth = createSocketAuthMiddleware();

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_LOCAL_URI);
    }
  });

  afterAll(async () => {
    process.env.USE_CLERK_AUTH = originalUseClerk;
    await User.deleteMany({ email: { $in: ['socktest@example.com', 'sockfallback@example.com'] } });
    await mongoose.connection.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject connection when no authorization token is provided in handshake', async () => {
    const socket = {
      id: 'mock_socket_1',
      handshake: { headers: {}, auth: {} },
    };
    const next = jest.fn();

    await socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toContain('Missing token');
  });

  it('should authenticate socket connection when user already exists with clerkUserId', async () => {
    const ws = await Workspace.create({
      name: 'Socket WS',
      adminName: 'Socket Admin',
      subscription: { plan: 'pro', status: 'active' },
    });

    const user = await User.create({
      name: 'Socket User',
      email: 'socktest@example.com',
      password: 'SecurePassword123!',
      clerkUserId: 'clerk_socket_123',
      role: 'SOFTWARE_ENGINEER',
      jobTitle: 'Software Engineer',
      workspaceId: ws._id,
    });

    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk_socket_123' });

    const socket = {
      id: 'mock_socket_2',
      handshake: {
        headers: { authorization: 'Bearer token_socket_123' },
        auth: {},
      },
    };
    const next = jest.fn();

    await socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.user).toBeDefined();
    expect(socket.user.id.toString()).toBe(user._id.toString());
    expect(socket.user.role).toBe('SOFTWARE_ENGINEER');
    expect(socket.user.workspaceId.toString()).toBe(ws._id.toString());
  });

  it('should successfully link clerkUserId via email fallback when connecting for the first time', async () => {
    const ws = await Workspace.create({
      name: 'Socket Fallback WS',
      adminName: 'Fallback Admin',
      subscription: { plan: 'enterprise', status: 'active' },
    });

    const user = await User.create({
      name: 'Fallback User',
      email: 'sockfallback@example.com',
      password: 'SecurePassword123!',
      role: 'TECH_LEAD',
      jobTitle: 'Tech Lead',
      workspaceId: ws._id,
    });

    mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk_socket_fallback_999' });
    mockGetUser.mockResolvedValueOnce({
      id: 'clerk_socket_fallback_999',
      emailAddresses: [{ emailAddress: 'sockfallback@example.com' }],
    });

    const socket = {
      id: 'mock_socket_3',
      handshake: {
        headers: {},
        auth: { token: 'token_socket_fallback' },
      },
    };
    const next = jest.fn();

    await socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.user).toBeDefined();
    expect(socket.user.id.toString()).toBe(user._id.toString());

    // Verify clerkUserId was linked in DB
    const updated = await User.findById(user._id);
    expect(updated.clerkUserId).toBe('clerk_socket_fallback_999');
  });
});
