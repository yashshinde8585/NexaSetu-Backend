/**
 * Storage and File Attachment Constants
 */
exports.STORAGE_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'text/plain',
    'application/json',
  ],
  BUCKET_NAME: 'task-attachments',
  QUOTAS: {
    FREE: 100 * 1024 * 1024, // 100MB
    PRO: 1024 * 1024 * 1024, // 1GB
    ENTERPRISE: 10 * 1024 * 1024 * 1024, // 10GB
  },
  DEFAULT_QUOTA: 100 * 1024 * 1024, // 100MB
};
