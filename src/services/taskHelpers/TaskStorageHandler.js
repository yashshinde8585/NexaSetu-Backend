const AppError = require('../../utils/appError');
const storageService = require('../storageService');

const validateTaskStorage = async (workspaceId, projectId, taskId, attachments) => {
  if (!attachments || attachments.length === 0) return 0;

  const totalSize = attachments.reduce((acc, a) => acc + a.size, 0);
  const hasQuota = await storageService.checkQuota(workspaceId, totalSize);
  
  if (!hasQuota) {
    throw new AppError('Storage quota exceeded for this workspace.', 403);
  }

  for (const file of attachments) {
    storageService.validateAttachment(file, {
      workspaceId: workspaceId.toString(),
      projectId: projectId.toString(),
      taskId: taskId.toString()
    });

    const isVerified = await storageService.verifyAttachment(file.storagePath, file.size);
    if (!isVerified) {
      throw new AppError(`Integrity Failure: File ${file.name} could not be verified in storage.`, 400);
    }
  }

  return totalSize;
};

module.exports = {
  validateTaskStorage
};
