const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  return _client;
}

module.exports = { getSupabaseAdmin };
