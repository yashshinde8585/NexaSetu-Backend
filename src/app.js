const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');

app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api', limiter);

app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'NexaSetu API is running!' });
});

module.exports = app;
