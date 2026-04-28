// Replace these with your Supabase project values: supabase.com → Project Settings → API
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

if (!window.supabase) {
  console.error('[Auth] Supabase CDN script failed to load');
  window.Auth = null;
} else if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
  console.warn('[Auth] Supabase not configured — replace SUPABASE_URL and SUPABASE_ANON_KEY in auth.js');
  window.Auth = null;
} else {
  const _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storageKey: 'dermai-auth' }
  });

  window.Auth = {
    async signInWithGoogle() {
      const { error } = await _client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/login-callback.html` }
      });
      if (error) console.error('[Auth] signInWithGoogle error:', error.message);
    },

    async signOut() {
      const { error } = await _client.auth.signOut();
      if (error) console.error('[Auth] signOut error:', error.message);
    },

    async getUser() {
      const { data: { user } } = await _client.auth.getUser();
      return user;
    },

    async getToken() {
      const { data: { session } } = await _client.auth.getSession();
      return session?.access_token ?? null;
    },

    onAuthStateChange(callback) {
      return _client.auth.onAuthStateChange(callback);
    }
  };
}
