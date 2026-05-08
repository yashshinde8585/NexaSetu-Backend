
const transform = (req, allowedFields = []) => {
  const dto = {};
  
  if (allowedFields.length > 0) {
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        dto[field] = req.body[field];
      }
    });
  } else {
    Object.assign(dto, req.body);
  }

  // Enrich the DTO with system metadata for audit and tracing.
  dto._meta = {
    userId: req.user?._id,
    workspaceId: req.user?.workspaceId,
    timestamp: new Date(),
    requestId: req.id // Injected by requestId middleware.
  };

  return dto;
};

module.exports = {
  transform
};
