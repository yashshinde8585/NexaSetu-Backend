const Task = require('../models/Task');
const supabase = require('../config/supabase');
const { STORAGE_CONSTANTS } = require('../utils/constants');
const logger = require('../utils/logger');

const runStorageCleanup = async () => {
  logger.info('[STORAGE-AUDIT] Starting Orphaned Storage Cleanup audit...');

  try {
    if (!supabase) {
      logger.warn('[STORAGE-AUDIT] Supabase client not initialized. Skipping.');
      return;
    }
    const { data: workspaces, error: wsError } = await supabase.storage
      .from(STORAGE_CONSTANTS.BUCKET_NAME)
      .list('', { limit: 100 });

    if (wsError) throw wsError;

    for (const ws of workspaces) {
      if (!ws.id) continue;
      logger.debug(`[STORAGE-AUDIT] Auditing workspace folder: ${ws.name}`);
    }

    logger.info('[STORAGE-AUDIT] Storage Cleanup audit completed.');
  } catch (error) {
    logger.error(
      `[STORAGE-AUDIT] Storage Cleanup audit failed: ${error.message}`
    );
    throw error;
  }
};

module.exports = { runStorageCleanup };
