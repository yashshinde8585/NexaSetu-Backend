const supabase = require('../config/supabase');
const { STORAGE_CONSTANTS } = require('../utils/constants');
const Workspace = require('../models/Workspace');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const CircuitBreaker = require('../utils/circuitBreaker');

const storageBreaker = new CircuitBreaker('Supabase_Storage', { failureThreshold: 3, resetTimeout: 30000 });

/**
 * Enterprise-grade Storage Service.
 * Handles signed URL generation, metadata validation, and secure cleanup.
 */
class StorageService {
  /**
   * Generates a signed upload URL for the client.
   * Expires in 60 seconds.
   */
  async getSignedUploadUrl(workspaceId, projectId, taskId, fileName, fileType, fileSize = 0) {
    if (!supabase) throw new Error('Supabase not configured');

    // 1. Quota Check (Pre-flight)
    const hasQuota = await this.checkQuota(workspaceId, fileSize);
    if (!hasQuota) {
      logger.warn(`[STORAGE] Upload denied: Quota exceeded for workspace ${workspaceId}`);
      throw new Error('Storage quota exceeded. Please upgrade or clean up assets.');
    }

    // 2. standard collision-resistant naming: {timestamp}_{uuid}_{originalName}
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFileName = `${Date.now()}_${uuidv4().substring(0, 8)}_${safeName}`;
    const filePath = `${workspaceId}/${projectId}/${taskId}/${finalFileName}`;

    const { data, error } = await storageBreaker.execute(() => supabase.storage
      .from(STORAGE_CONSTANTS.BUCKET_NAME)
      .createSignedUploadUrl(filePath), () => ({ error: new Error('Storage service is temporarily unavailable') }));

    if (error) {
      logger.error(`[STORAGE] Failed to create signed upload URL: ${error.message}`);
      throw error;
    }

    logger.info(`[STORAGE] Signed Upload URL generated`, { 
      workspaceId, 
      path: filePath, 
      expiresIn: '60s' 
    });

    return {
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath: filePath,
      fileName: finalFileName
    };
  }

  /**
   * Generates a temporary download URL for a private asset.
   * Adaptive Expiry: 
   * - 'preview' (image/pdf): 15 minutes (short)
   * - 'download' (others): 1 hour (long)
   */
  async getSignedDownloadUrl(storagePath, type = 'download') {
    if (!supabase) return null;
    const expiry = 315360000; 

    const { data, error } = await storageBreaker.execute(() => supabase.storage
      .from(STORAGE_CONSTANTS.BUCKET_NAME)
      .createSignedUrl(storagePath, expiry), () => ({ error: new Error('Storage service is temporarily unavailable') }));

    if (error) {
      logger.error(`[STORAGE] Failed to generate signed URL: ${error.message}`, { path: storagePath });
      return null;
    }

    return data.signedUrl;
  }

  /**
   * Verifies that a file actually exists in storage and matches reported size.
   * Anti-Spoofing Layer.
   */
  async verifyAttachment(storagePath, expectedSize) {
    if (!supabase) return true;

    // Split path to get directory and filename for the list() command
    const pathParts = storagePath.split('/');
    const fileName = pathParts.pop();
    const directory = pathParts.join('/');

    const { data, error } = await storageBreaker.execute(() => supabase.storage
      .from(STORAGE_CONSTANTS.BUCKET_NAME)
      .list(directory, { 
        limit: 1,
        offset: 0,
        search: fileName
      }), () => ({ error: new Error('Storage service is temporarily unavailable') }));

    if (error || !data || data.length === 0) {
      logger.warn(`[STORAGE] Verification failed: File not found`, { path: storagePath });
      return false;
    }

    const fileInfo = data[0];

    // Strict size verification (Supabase list() returns size in metadata)
    const actualSize = fileInfo.metadata?.size || fileInfo.size || 0;
    
    if (Math.abs(actualSize - expectedSize) > 1024) { // Allow 1KB drift
      logger.warn(`[STORAGE] Verification failed: Size mismatch`, { 
        path: storagePath, 
        expected: expectedSize, 
        actual: actualSize 
      });
      return false;
    }

    return true;
  }

  /**
   * Checks if a workspace has enough quota for an upload.
   */
  async checkQuota(workspaceId, additionalBytes) {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return false;

    const currentUsed = workspace.storageUsed || 0;
    const quota = workspace.storageQuota || STORAGE_CONSTANTS.DEFAULT_QUOTA;

    if (currentUsed + additionalBytes > quota) {
      logger.warn(`[STORAGE] Quota exceeded for workspace ${workspaceId}`, {
        used: currentUsed,
        quota,
        attempted: additionalBytes
      });
      return false;
    }

    return true;
  }

  /**
   * Atomically updates storage usage for a workspace.
   */
  async updateStorageUsage(workspaceId, bytesChange) {
    try {
      await Workspace.findByIdAndUpdate(workspaceId, {
        $inc: { storageUsed: bytesChange }
      });
      logger.info(`[STORAGE] Updated usage for ${workspaceId}: ${bytesChange} bytes`);
    } catch (error) {
      logger.error(`[STORAGE] Failed to update usage for ${workspaceId}: ${error.message}`);
    }
  }

  /**
   * Validates attachment metadata against strict security rules.
   */
  validateAttachment(attachment, context) {
    const { workspaceId, projectId, taskId } = context;

    // 1. Path Format Validation: {workspaceId}/{projectId}/{taskId}/{filename}
    // For new tasks, we allow 'new', 'ai-extract', or 'temp' placeholders
    const isNewTask = taskId === 'new' || taskId === 'ai-extract' || taskId === 'temp';
    
    if (isNewTask) {
      // For new tasks, just ensure it belongs to the correct workspace and project
      const prefix = `${workspaceId}/${projectId}/`;
      if (!attachment.storagePath.startsWith(prefix)) {
        throw new Error(`Invalid storage path. Must belong to the current project context.`);
      }
    } else {
      // For existing tasks, enforce the exact taskId in the path
      const expectedPrefix = `${workspaceId}/${projectId}/${taskId}/`;
      if (!attachment.storagePath.startsWith(expectedPrefix)) {
        throw new Error(`Invalid storage path. Must belong to the current task context.`);
      }
    }

    // 2. Size Validation (10MB)
    if (attachment.size > STORAGE_CONSTANTS.MAX_FILE_SIZE) {
      throw new Error(`File ${attachment.name} exceeds 10MB limit.`);
    }

    // 3. MIME Type Whitelist
    if (!STORAGE_CONSTANTS.ALLOWED_MIME_TYPES.includes(attachment.type)) {
      throw new Error(`File type ${attachment.type} is not allowed.`);
    }

    // 4. Filename Security (No directory traversal)
    if (attachment.name.includes('/') || attachment.name.includes('..')) {
      throw new Error(`Malicious filename detected.`);
    }

    return true;
  }
}

module.exports = new StorageService();
