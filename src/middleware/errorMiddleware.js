/**
 * Global error handler middleware for Express.
 * Provides a consistent response format for all application errors.
 */

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log critical errors for developer awareness
  console.error(`[FATAL ERROR]: ${err.message}`, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  // Handle specific MongoDB/Mongoose errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(el => el.message);
    return res.status(400).json({
      status: 'fail',
      message: `Invalid input data: ${messages.join('. ')}`
    });
  }

  if (err.code === 11000) {
    const value = err.message.match(/(["'])(\\?.)*?\1/)[0];
    return res.status(400).json({
      status: 'fail',
      message: `Duplicate field value: ${value}. Please use another value!`
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid token. Please log in again.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'fail',
      message: 'Your token has expired. Please log in again.'
    });
  }

  // Generic production response
  res.status(err.statusCode).json({
    status: err.status,
    message: err.isOperational ? err.message : 'Something went wrong on our end. Our engineers are investigating.'
  });
};

module.exports = globalErrorHandler;
