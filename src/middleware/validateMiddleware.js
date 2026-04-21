const AppError = require('../utils/appError');

// Middleware to validate request body against a defined Zod schema
const validate = (schema) => (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new AppError('Request body is missing or empty.', 400));
  }
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    let errorMessage = error.message;
    
    // Standardize validation signals for consistent client error reporting
    if (error.errors) {
      errorMessage = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
    }

    next(new AppError(errorMessage, 400));
  }
};

module.exports = validate;
