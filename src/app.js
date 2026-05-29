const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const { isRedisConnected } = require('./config/redis');
const logger = require('./utils/logger');
const SmartRateLimitStore = require('./utils/SmartRateLimitStore');
const crypto = require('crypto');

const app = express();

app.set('trust proxy', 1);

app.use(compression());

app.use(
  cors({
    origin:
      config.env === 'development' ? 'http://localhost:5173' : config.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'x-idempotency-key',
    ],
    maxAge: 86400,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

app.use(
  express.json({
    limit: '15kb',
    verify: (req, res, buf) => {
      if (req.originalUrl.includes('/webhooks')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'fail',
      code: 'MALFORMED_JSON',
      message:
        'The request body contains malformed JSON. Please check your syntax.',
    });
  }
  next(err);
});
app.use(express.urlencoded({ extended: true, limit: '15kb' }));
app.use(cookieParser());

const telemetry = require('./middlewares/telemetryMiddleware');
const idempotency = require('./middlewares/idempotencyMiddleware');
const normalizeUnicode = require('./middlewares/normalizationMiddleware');

const timeoutHandler = require('./middlewares/timeoutHandler');

app.use(telemetry);
app.use(normalizeUnicode);
app.use(idempotency());

app.use(timeoutHandler(15000));

const { runWithContext } = require('./utils/context');

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = requestId;
  const start = Date.now();

  runWithContext({ requestId }, () => {
    let logged = false;
    const logRequest = () => {
      if (logged) return;
      logged = true;
      const duration = Date.now() - start;
      const status = res.statusCode;
      const finished = res.writableFinished || res.finished;
      logger.info(
        `[API] ${req.method} ${req.url} - ${status} [${duration}ms]${finished ? '' : ' (aborted)'}`
      );
    };

    res.on('finish', logRequest);
    res.on('close', logRequest);

    next();
  });
});

const createLimiter = (prefix, max, windowMs = 60 * 60 * 1000) =>
  rateLimit({
    windowMs,
    max,
    message: {
      status: 'fail',
      code: 'TOO_MANY_REQUESTS',
      message: 'Operational limit exceeded. Please wait before retrying.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new SmartRateLimitStore({
      prefix: `rl:${prefix}:`,
      windowMs,
    }),
    skip: (req) => config.isTest,
  });

// Public health check (bypass global rate limit for monitoring)
const healthRoutes = require('./routes/healthRoutes');
app.use('/api/health', healthRoutes);

// Swagger Documentation
const setupSwagger = require('./config/swagger');
setupSwagger(app);

const isDev = config.env === 'development';
app.use('/api', createLimiter('global', isDev ? 10000 : 5000, 15 * 60 * 1000));

app.use('/api/auth/login', createLimiter('auth-login', 15, 5 * 60 * 1000));

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
const billingRoutes = require('./routes/billingRoutes');
const rbacRoutes = require('./routes/rbacRoutes');
const executionRoutes = require('./routes/executionRoutes');
const observabilityRoutes = require('./routes/observabilityRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const directiveRoutes = require('./routes/directiveRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

v1Router.use('/webhooks', webhookRoutes);
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
v1Router.use('/billing', billingRoutes);

v1Router.use('/rbac', rbacRoutes);
v1Router.use('/execution', executionRoutes);
v1Router.use('/observability', observabilityRoutes);
v1Router.use('/metrics', metricsRoutes);
v1Router.use('/directives', directiveRoutes);

v1Router.use('/engineering', engineeringRoutes);
v1Router.use('/leadership', leadershipRoutes);
v1Router.use('/operations', operationsRoutes);
v1Router.use('/admin', adminRoutes);

// Mounted above rate limiter
app.use(['/api/v1', '/api'], v1Router);

app.use((req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.method} ${req.originalUrl} on this server! Check route mounting.`,
  });
});

const globalErrorHandler = require('./middlewares/errorMiddleware');
app.use(globalErrorHandler);

module.exports = app;
