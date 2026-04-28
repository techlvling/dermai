const { createClient } = require('@supabase/supabase-js');

async function verifyAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Auth not configured (missing SUPABASE_URL or SUPABASE_ANON_KEY)' });
  }

  // Create a per-request client with the user's JWT so Supabase validates it
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  req.supabaseToken = token;
  next();
}

module.exports = { verifyAuth };
