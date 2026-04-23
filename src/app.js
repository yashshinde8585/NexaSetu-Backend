const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

// CORE CONFIGURATION
const config = require('./config/config');
const { getRedisClient, isRedisConnected } = require('./config/redis');
const logger = require('./utils/logger');

const app = express();

app.use(compression());

// SECURITY & INFRASTRUCTURE LAYER
// CORS must be first to handle preflight OPTIONS requests across all endpoints
app.use(cors({
  origin: config.env === 'development' ? 'http://localhost:5173' : config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Idempotency-Key', 'X-Idempotency-Key', 'x-idempotency-key'],
  maxAge: 86400, // Cache preflight results for 24 hours (reduces latency on subsequent requests)
}));

// SECURITY MIDDLEWARE
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));


app.use(express.json({ limit: '15kb' }));
// API Integrity: Catch malformed JSON before it reaches business logic
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'fail',
      code: 'MALFORMED_JSON',
      message: 'The request body contains malformed JSON. Please check your syntax.'
    });
  }
  next(err);
});
app.use(express.urlencoded({ extended: true, limit: '15kb' }));
app.use(cookieParser());

const telemetry = require('./middleware/telemetryMiddleware');
const idempotency = require('./middleware/idempotencyMiddleware');
const normalizeUnicode = require('./middleware/normalizationMiddleware');

app.use(telemetry);
app.use(normalizeUnicode);
app.use(idempotency());

// Standard request logging (Disabled in production for performance)
app.use((req, res, next) => {
  logger.info(`[DEBUG] ${req.method} ${req.url}`);
  next();
});

// Centralized rate-limiting factory powered by Redis for distributed state
const createLimiter = (prefix, max, windowMs = 60 * 60 * 1000) => rateLimit({
  windowMs,
  max,
  message: { status: 'fail', message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: async (...args) => {
      if (!isRedisConnected()) {
        logger.warn(`[RATE-LIMIT] Redis not connected → skipping cache for ${prefix}`);
        return null;
      }
      const client = getRedisClient();
      try {
        return await client.call(...args);
      } catch (err) {
        logger.warn(`[RATE-LIMIT] Redis failure for ${prefix}: ${err.message}`);
        return null;
      }
    },
    prefix: `rl:${prefix}:`,
  }),
});

// Global protection against automated brute-force and DDoS patterns
app.use('/api', createLimiter('global', 1000, 15 * 60 * 1000));
app.use('/api/auth/login', createLimiter('auth-login', 10, 5 * 60 * 1000));

// Operational Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: { service: 'NexaSetu API', env: config.env, timestamp: new Date().toISOString() }
  });
});

const v1Router = express.Router();

// Routes are logically grouped by domain and mounted on versioned paths.

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const aiRoutes = require('./routes/aiRoutes');
const githubRoutes = require('./routes/githubRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const teamRoutes = require('./routes/teamRoutes');
const sprintRoutes = require('./routes/sprintRoutes');
const adminRoutes = require('./routes/adminRoutes');
const engineeringRoutes = require('./routes/engineeringRoutes');
const leadershipRoutes = require('./routes/leadershipRoutes');
const operationsRoutes = require('./routes/operationsRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const actionRoutes = require('./routes/actionRoutes');
const magicBarRoutes = require('./routes/magicBarRoutes');
const strategicIntentRoutes = require('./routes/strategicIntentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const commentRoutes = require('./routes/commentRoutes');
const epiRoutes = require('./routes/epiRoutes');

// Resource Endpoints
v1Router.use('/auth', authRoutes);
v1Router.use('/projects', projectRoutes);
v1Router.use('/tasks', taskRoutes);
v1Router.use('/ai', aiRoutes);
v1Router.use('/github', githubRoutes);
v1Router.use('/dashboard', dashboardRoutes);
v1Router.use('/team', teamRoutes);
v1Router.use('/sprints', sprintRoutes);
v1Router.use('/resources', resourceRoutes);
v1Router.use('/actions', actionRoutes);
v1Router.use('/magic', magicBarRoutes);
v1Router.use('/strategic', strategicIntentRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/comments', commentRoutes);
v1Router.use('/epi', epiRoutes);

// Specialized Domain Workspaces
v1Router.use('/engineering', engineeringRoutes);
v1Router.use('/leadership', leadershipRoutes);
v1Router.use('/operations', operationsRoutes);
v1Router.use('/admin', adminRoutes);

// Mount API versions (Supports both versioned and non-versioned legacy requests)
app.use(['/api/v1', '/api'], v1Router);

// Catch-all for unhandled routes to prevent stack trace leaks
app.use((req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

const globalErrorHandler = require('./middleware/errorMiddleware');
app.use(globalErrorHandler);

module.exports = app;
