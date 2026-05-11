
const success = (res, data = null, statusCode = 200, message = 'Operation successful', code = 'SUCCESS') => {
  const responseBody = {
    success: true,
    status: 'success', 
    code,
    message,
  };

  if (data !== null) {
    if (data.data || data.pagination || data.results) {
      Object.assign(responseBody, data);
    } else {
      responseBody.data = data;
    }
  }

  return res.status(statusCode).json(responseBody);
};

const error = (res, message = 'Operation failed', code = 'ERROR', statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    status: 'error',
    code,
    message,
  });
};

module.exports = {
  success,
  error
};
