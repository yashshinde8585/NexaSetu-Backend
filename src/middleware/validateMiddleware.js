const AppError = require('../utils/appError');

// Middleware to validate request body against a defined Zod schema
const validate = (schema) => (req, res, next) => {
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
