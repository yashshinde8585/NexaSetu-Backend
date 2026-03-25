/**
 * Wraps an asynchronous middleware function to catch any errors and pass them to the next middleware.
 * Removes the need for repetitive try-catch blocks in controllers.
 */
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
