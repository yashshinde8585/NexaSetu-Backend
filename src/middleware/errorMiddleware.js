const logger = require('../utils/logger');
const config = require('../config/config');
const AppError = require('../utils/appError');
const ResponseBuilder = require('../utils/responseBuilder');

// Standardized error pipeline for consistent API responses.
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (config.isProduction) {
    let error = Object.assign(err);
    error.message = err.message;

    // Map technical DB/JWT signals to user-friendly messages.
    if (err.name === 'CastError') error = handleCastErrorDB(err);
    else if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    else if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    else if (err.name === 'JsonWebTokenError') error = handleJWTError();
    else if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  } else {
    if (err.code === 11000) err.statusCode = 400;
    if (err.name === 'ValidationError') err.statusCode = 400;
    if (err.name === 'CastError') err.statusCode = 400;
    
    sendErrorDev(err, req, res);
  }
};

const handleCastErrorDB = (err) => {
  return new AppError(`Invalid ${err.path}: ${err.value}`, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.keyValue ? Object.values(err.keyValue)[0] : 'unknown';
  return new AppError(`Duplicate field value: ${value}. Please use another value!`, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

const sendErrorDev = (err, req, res) => {
  return res.status(err.statusCode).json({
    success: false,
    status: err.statusCode,
    code: err.errorCode || err.code || 'ERROR',
    message: err.message,
    stack: err.stack,
    error: err
  });
};

const sendErrorProd = (err, req, res) => {
  if (err.isOperational) {
    return ResponseBuilder.error(res, err.message, err.errorCode || err.code || 'OPERATIONAL_ERROR', err.statusCode);
  }

  logger.error('ERROR 💥', err);
  return ResponseBuilder.error(res, 'Something went very wrong!', 'INTERNAL_SERVER_ERROR', 500);
};

module.exports = globalErrorHandler;
