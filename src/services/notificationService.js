const Notification = require('../models/Notification');
const { resolveWorkspaceId } = require('../utils/workspaceHelper');
const AppError = require('../utils/appError');

const getMyNotifications = async (user) => {
  const notifications = await Notification.find({
    recipient: user?._id,
    workspaceId: resolveWorkspaceId(user),
  })
    .sort('-createdAt')
    .limit(20)
    .populate('sender', 'name email');

  return notifications;
};

const markAsRead = async (user, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: user?._id },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new AppError('Notification not found or access denied', 404);
  }

  return notification;
};

const markAllAsRead = async (user) => {
  await Notification.updateMany(
    { recipient: user?._id, isRead: false },
    { isRead: true }
  );
};

const deleteAllMyNotifications = async (user) => {
  await Notification.deleteMany({
    recipient: user?._id,
    workspaceId: resolveWorkspaceId(user),
  });
};

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteAllMyNotifications,
};
