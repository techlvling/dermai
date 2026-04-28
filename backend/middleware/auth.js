const { createClient } = require('@supabase/supabase-js');

let _anonClient = null;

function getAnonClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!_anonClient) {
    _anonClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return _anonClient;
}

async function verifyAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  const client = getAnonClient();

  if (!client) {
    return res.status(500).json({ error: 'Auth not configured (missing SUPABASE_URL or SUPABASE_ANON_KEY)' });
  }

  try {
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    // token forwarded so downstream route handlers can build user-scoped RLS clients
    req.supabaseToken = token;
    next();
  } catch (err) {
    console.error('[verifyAuth] Supabase auth error:', err.message);
    return res.status(502).json({ error: 'Auth service unavailable' });
  }
}

module.exports = { verifyAuth };
