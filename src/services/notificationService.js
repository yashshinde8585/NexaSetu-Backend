const Notification = require('../models/Notification');
const { resolveWorkspaceId } = require('../utils/workspaceHelper');
const AppError = require('../utils/appError');

class NotificationService {
  async getMyNotifications(user) {
    const notifications = await Notification.find({
      recipient: user?._id,
      workspaceId: resolveWorkspaceId(user),
    })
      .sort('-createdAt')
      .limit(20)
      .populate('sender', 'name email');

    return notifications;
  }

  async markAsRead(user, notificationId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: user?._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      throw new AppError('Notification not found or access denied', 404);
    }

    return notification;
  }

  async markAllAsRead(user) {
    await Notification.updateMany(
      { recipient: user?._id, isRead: false },
      { isRead: true }
    );
  }

  async deleteAllMyNotifications(user) {
    await Notification.deleteMany({
      recipient: user?._id,
      workspaceId: resolveWorkspaceId(user),
    });
  }
}

module.exports = new NotificationService();
