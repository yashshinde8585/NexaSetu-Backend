const AppError = require('../utils/appError');

/**
 * Validation Middleware
 * Validates the request body against a defined Zod schema.
 */
const validate = (schema) => (req, res, next) => {
  try {
    // Parse the incoming body against our technical data contract
    schema.parse(req.body);
    next();
  } catch (error) {
    // Standardize validation signals for consistent client error handling
    const errorMessage = error.errors
      ? error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')
      : error.message;

    next(new AppError(errorMessage, 400));
  }
};

module.exports = validate;
