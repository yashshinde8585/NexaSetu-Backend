const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const config = require('./config/config');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dotenv.config();

// Fail Fast: Ensure critical secrets are present
const REQUIRED_ENV = ['JWT_SECRET', 'GROQ_API_KEY', 'DB_URI'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`[FATAL] Missing environment variable: ${key}`);
        process.exit(1);
    }
});

const app = express();


const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const aiRoutes = require('./routes/aiRoutes');
const githubRoutes = require('./routes/githubRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const actionRoutes = require('./routes/actionRoutes');
const magicBarRoutes = require('./routes/magicBarRoutes');
const teamRoutes = require('./routes/teamRoutes');
const sprintRoutes = require('./routes/sprintRoutes');

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, 
    message: 'Too many requests from this IP, please try again after 15 minutes.'
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: 'Too many login attempts. Please try again after an hour.'
});

const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: 'AI allowance exceeded for this hour. Please try again later.'
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/ai', aiLimiter);

app.use(helmet());
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'development' ? true : (process.env.CLIENT_URL || 'http://localhost:5173'), 
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/magic', magicBarRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/sprints', sprintRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'NexaSetu API is running!' });
});

// Global Error Handler (must be the last middleware)
const globalErrorHandler = require('./middleware/errorMiddleware');
app.use(globalErrorHandler);

// Handle 404 - If request reaches here, no route matched
app.use((req, res, next) => {
    res.status(404).json({ status: 'fail', message: `Route ${req.originalUrl} not found on this server` });
});

module.exports = app;
