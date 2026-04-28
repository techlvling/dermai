const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  return _client;
}

module.exports = { getSupabaseAdmin };
