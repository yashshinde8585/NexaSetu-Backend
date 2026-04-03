// Encapsulates asynchronous route handlers implicitly transferring execution failures to the global error middleware.
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
