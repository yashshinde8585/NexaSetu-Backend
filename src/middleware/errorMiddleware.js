const logger = require('../utils/logger');
const config = require('../config/config');
const AppError = require('../utils/appError');

// Standardized error pipeline to ensure consistent API responses across all environments
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (config.isProduction) {
    let error = { ...err };
    error.message = err.message;

    // Map technical database and JWT signals to user-friendly errors
    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  } else {
    // Standardize status codes for common database errors even in dev
    if (err.code === 11000) err.statusCode = 400;
    if (err.name === 'ValidationError') err.statusCode = 400;
    if (err.name === 'CastError') err.statusCode = 400;
    
    sendErrorDev(err, req, res);
  }
};

// Handlers for specific database and authorization errors
const handleCastErrorDB = (err) => {
  return new AppError(`Invalid ${err.path}: ${err.value}`, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  return new AppError(`Duplicate field value: ${value}. Please use another value!`, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

// Verbose error diagnostics for rapid debugging in development environments
const sendErrorDev = (err, req, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

// Sanitized error responses for production to prevent sensitive infrastructure leaks
const sendErrorProd = (err, req, res) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      code: err.errorCode || 'OPERATIONAL_ERROR',
      message: err.message,
    });
  }

  // Log unknown critical errors and send generic message
  logger.error('ERROR 💥', err);
  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went very wrong!',
  });
};

module.exports = globalErrorHandler;
