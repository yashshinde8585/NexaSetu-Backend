const toUserDTO = (user) => {
  if (!user) return null;
  const dto = {
    id: user._id?.toString() || user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    workspaceId: user.workspaceId?.toString() || user.workspaceId,
    assignedProjectId:
      user.assignedProjectId?.toString() || user.assignedProjectId,
    hasSeenTour: user.hasSeenTour,
    profilePicture: user.profilePicture,
    jobTitle: user.jobTitle,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  return dto;
};

const toWorkspaceDTO = (workspace) => {
  if (!workspace) return null;
  const dto = {
    id: workspace._id?.toString() || workspace.id,
    name: workspace.name,
    ownerId: workspace.ownerId?.toString() || workspace.ownerId,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
  return dto;
};

module.exports = {
  toUserDTO,
  toWorkspaceDTO,
};
