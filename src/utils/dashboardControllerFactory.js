const catchAsync = require('./catchAsync');

/**
 * Creates a standard dashboard controller that fetches data from a service
 * @param {Object} service - The service object containing dashboard methods
 * @param {Array<string>|Function} dataMap - Array of service method names or a custom function
 * @param {Object} extraData - Optional static data to include in response
 */
module.exports = (service, dataMap, extraData = {}) => {
  return catchAsync(async (req, res, next) => {
    const userId = req.user._id;
    const workspaceId = req.user.workspaceId;

    let resultData = {};

    if (Array.isArray(dataMap)) {
      // Execute each method in the array
      const promises = dataMap.map(methodName => service[methodName](userId, workspaceId));
      const results = await Promise.all(promises);
      
      dataMap.forEach((methodName, index) => {
        // Remove 'get' prefix and camelCase the key
        const key = methodName.replace(/^get/, '').replace(/^[A-Z]/, c => c.toLowerCase());
        resultData[key] = results[index];
      });
    } else if (typeof dataMap === 'function') {
      resultData = await dataMap(req, service);
    }

    res.status(200).json({
      status: 'success',
      data: {
        ...resultData,
        ...extraData
      }
    });
  });
};
