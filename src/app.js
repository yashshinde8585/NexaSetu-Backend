const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

// CORE CONFIGURATION
const config = require('./config/config');
const { getRedisClient } = require('./config/redis');
const logger = require('./utils/logger');

const app = express();

// SECURITY & UTILITY MIDDLEWARE
app.use(helmet());

app.use(cors({
  origin: config.env === 'development' ? true : config.clientUrl,
  credentials: true,
}));

// Request Body Parsing (DOS Protection)
app.use(express.json({ limit: '15kb' }));
app.use(express.urlencoded({ extended: true, limit: '15kb' }));
app.use(cookieParser());

const telemetry = require('./middleware/telemetryMiddleware');
app.use(telemetry);

// Debug Logging
app.use((req, res, next) => {
  logger.info(`[DEBUG] ${req.method} ${req.url}`);
  next();
});

// Rate Limiting Factory (Redis State)
const createLimiter = (prefix, max, windowMs = 60 * 60 * 1000) => rateLimit({
  windowMs,
  max,
  message: { status: 'fail', message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: async (...args) => {
      const client = getRedisClient();
      if (!client) return null;
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

// Apply DDoS Protection
app.use('/api', createLimiter('global', 1000, 15 * 60 * 1000));
app.use('/api/auth/login', createLimiter('auth-login', 10, 5 * 60 * 1000));

// Operational Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: { service: 'NexaSetu API', env: config.env, timestamp: new Date().toISOString() }
  });
});

// API ROUTE DEFINITIONS
const v1Router = express.Router();

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

// ERROR & EXCEPTION HANDLING
app.use((req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

const globalErrorHandler = require('./middleware/errorMiddleware');
app.use(globalErrorHandler);

module.exports = app;
