const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const uploadFile = async (fileBuffer, originalName, bucket = 'avatars') => {
  try {
    const fileExt = originalName.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: `image/${fileExt}`,
        cacheControl: '3600',
        upsert: false
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

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      logger.error(`[STORAGE_DELETE_ERROR]: ${error.message}`);
    }
  } catch (err) {
    logger.error(`[STORAGE_DELETE_SERVICE_ERROR]: ${err.message}`);
  }
};

module.exports = {
  uploadFile,
  deleteFile,
};
