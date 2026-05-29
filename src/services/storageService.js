const supabase = require('../config/supabase');
const Workspace = require('../models/Workspace');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { STORAGE_CONSTANTS } = require('../utils/constants');
const { v4: uuidv4 } = require('uuid');

const uploadFile = async (fileBuffer, originalName, bucket = 'avatars') => {
  try {
    const fileExt = originalName.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${bucket}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: `image/${fileExt}`,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      logger.error(`[STORAGE_UPLOAD_ERROR]: ${error.message}`);
      throw new Error('FAILED_TO_UPLOAD_TO_CLOUD_STORAGE');
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (err) {
    logger.error(`[STORAGE_SERVICE_ERROR]: ${err.message}`);
    throw err;
  }
};

const deleteFile = async (publicUrl, bucket = 'avatars') => {
  try {
    if (!publicUrl) return;

    // Extract path from URL: https://.../storage/v1/object/public/avatars/avatars/filename.jpg
    const urlParts = publicUrl.split(`${bucket}/`);
    if (urlParts.length < 2) return;

    const filePath = urlParts[1];

    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      logger.error(`[STORAGE_DELETE_ERROR]: ${error.message}`);
    }
  } catch (err) {
    logger.error(`[STORAGE_DELETE_SERVICE_ERROR]: ${err.message}`);
  }
};

/**
 * Checks if the workspace has enough storage quota left.
 */
const checkQuota = async (workspaceId, fileSize) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return false;

  const used = workspace.subscription.storageUsed || 0;
  const quota =
    workspace.subscription.storageQuota || STORAGE_CONSTANTS.DEFAULT_QUOTA;

  return used + fileSize <= quota;
};

/**
 * Validates attachment metadata and size.
 */
const validateAttachment = (file, context) => {
  if (!STORAGE_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new AppError(`Unsupported file type: ${file.type}`, 400);
  }

  if (file.size > STORAGE_CONSTANTS.MAX_FILE_SIZE) {
    throw new AppError(
      `File too large. Max size: ${STORAGE_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      400
    );
  }

  // Basic path validation - ensuring it belongs to the right workspace
  const expectedPrefix = `${context.workspaceId}/`;
  if (!file.storagePath.startsWith(expectedPrefix)) {
    throw new AppError('Invalid storage path for this workspace.', 400);
  }

  return true;
};

/**
 * Verifies the existence and size of a file in cloud storage.
 */
const verifyAttachment = async (storagePath, expectedSize) => {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_CONSTANTS.BUCKET_NAME)
      .list(storagePath.split('/').slice(0, -1).join('/'), {
        search: storagePath.split('/').pop(),
      });

    if (error || !data || data.length === 0) {
      return false;
    }

    // Supabase list returns metadata including size
    const file = data.find((f) => f.name === storagePath.split('/').pop());
    return file && file.metadata.size === expectedSize;
  } catch (err) {
    logger.error(`[STORAGE_VERIFY_ERROR]: ${err.message}`);
    return false;
  }
};

/**
 * Updates the storage usage count for a workspace.
 */
const updateStorageUsage = async (workspaceId, sizeDelta) => {
  await Workspace.findByIdAndUpdate(workspaceId, {
    $inc: { 'subscription.storageUsed': sizeDelta },
  });
};

/**
 * Generates a signed URL for temporary access to a private file.
 */
const getSignedDownloadUrl = async (storagePath) => {
  const { data, error } = await supabase.storage
    .from(STORAGE_CONSTANTS.BUCKET_NAME)
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error) {
    logger.error(`[STORAGE_SIGNED_URL_ERROR]: ${error.message}`);
    return null;
  }

  return data.signedUrl;
};

/**
 * Generates a signed upload URL for direct-to-cloud uploads.
 */
const getSignedUploadUrl = async (
  workspaceId,
  projectId,
  taskId,
  fileName,
  fileType,
  fileSize
) => {
  const fileExt = fileName.split('.').pop();
  const storagePath = `${workspaceId}/${projectId}/${taskId}/${uuidv4()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_CONSTANTS.BUCKET_NAME)
    .createSignedUploadUrl(storagePath);

  if (error) {
    logger.error(`[STORAGE_SIGNED_UPLOAD_ERROR]: ${error.message}`);
    throw new AppError('Failed to generate upload URL', 500);
  }

  return {
    uploadUrl: data.signedUrl,
    storagePath,
    token: data.token,
  };
};

module.exports = {
  uploadFile,
  deleteFile,
  checkQuota,
  validateAttachment,
  verifyAttachment,
  updateStorageUsage,
  getSignedDownloadUrl,
  getSignedUploadUrl,
};
