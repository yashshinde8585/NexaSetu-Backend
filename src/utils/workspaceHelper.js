/**
 * Resolves the workspaceId from a user object, safely handling both
 * populated (Mongoose document/object) and non-populated (raw ObjectId) references.
 *
 * This was previously duplicated verbatim in notificationController.
 */
const resolveWorkspaceId = (user) =>
  user?._workspaceId ||
  (typeof user?.workspaceId === 'object'
    ? user.workspaceId?._id
    : user.workspaceId);

module.exports = { resolveWorkspaceId };
