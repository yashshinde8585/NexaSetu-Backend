
class ResponseBuilder {
  static success(res, data = null, statusCode = 200, message = 'Operation successful', code = 'SUCCESS') {
    // Check if data already has a 'status' or 'data' envelope to avoid nesting
    const responseBody = {
      success: true,
      status: 'success', 
      code,
      message,
    };

    if (data !== null) {
      // If data is already enveloped with pagination or data wrappers, merge it gracefully
      if (data.data || data.pagination || data.results) {
        Object.assign(responseBody, data);
      } else {
        responseBody.data = data;
      }
    }

    return res.status(statusCode).json(responseBody);
  }

  static error(res, message = 'Operation failed', code = 'ERROR', statusCode = 400) {
    return res.status(statusCode).json({
      success: false,
      status: 'error',
      code,
      message,
    });
  }
}

module.exports = ResponseBuilder;
