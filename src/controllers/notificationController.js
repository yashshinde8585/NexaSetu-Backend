const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');
const { resolveWorkspaceId } = require('../utils/workspaceHelper');

// Retrieve all notifications for the authenticated user within their active workspace.
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const notifications = await Notification.find({
    recipient: req.user?._id,
    workspaceId: resolveWorkspaceId(req.user),
  })
    .sort('-createdAt')
    .limit(20)
    .populate('sender', 'name email');

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: { notifications },
  });
});

// Update notification state to 'read' for processed system events.
exports.markAsRead = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user?._id },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      status: 'fail',
      message: 'Notification not found or access denied',
    });
  }

  res.status(200).json({
    status: 'success',
    data: { notification },
  });
});

// Batch update all notifications to read for cleared workspaces.
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    { recipient: req.user?._id, isRead: false },
    { isRead: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'All notifications marked as read',
  });
});

// Permanently remove all notifications for the authenticated user to clear workspace clutter.
exports.deleteAllMyNotifications = catchAsync(async (req, res, next) => {
  await Notification.deleteMany({
    recipient: req.user?._id,
    workspaceId: resolveWorkspaceId(req.user),
  });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
