const notificationService = require('../services/notificationService');
const catchAsync = require('../utils/catchAsync');

// Retrieve all notifications for the authenticated user within their active workspace.
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const notifications = await notificationService.getMyNotifications(req.user);

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: { notifications },
  });
});

// Update notification state to 'read' for processed system events.
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await notificationService.markAsRead(
    req.user,
    req.params.id
  );

  res.status(200).json({
    status: 'success',
    data: { notification },
  });
});

// Batch update all notifications to read for cleared workspaces.
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await notificationService.markAllAsRead(req.user);

  res.status(200).json({
    status: 'success',
    message: 'All notifications marked as read',
  });
});

// Permanently remove all notifications for the authenticated user to clear workspace clutter.
exports.deleteAllMyNotifications = catchAsync(async (req, res, next) => {
  await notificationService.deleteAllMyNotifications(req.user);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
