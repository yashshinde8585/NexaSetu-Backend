const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  logger.warn('[SUPABASE] Missing backend environment variables. Storage cleanup will fail.');
}

// Service role client for bypass RLS in cleanup jobs
const supabase = createClient(supabaseUrl || '', supabaseServiceRoleKey || '');

module.exports = supabase;
