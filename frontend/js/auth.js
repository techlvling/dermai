// Replace these with your Supabase project values: supabase.com → Project Settings → API
const SUPABASE_URL = 'https://kqinywnsotyssdciciuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxaW55d25zb3R5c3NkY2ljaXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzg5NTksImV4cCI6MjA5Mjk1NDk1OX0.vG8fTQW5KuZBb0QNjfz-LymVwVmn_Z3sXX6iRdMKc_w';

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
      // Bundle Drive scope into the initial sign-in so the user only sees
      // one OAuth consent screen and the resulting session always has a
      // provider_token with drive.file. Without this, users who signed in
      // before the Drive feature shipped never get a Drive-scoped token,
      // and post-scan backups fail with "insufficient authentication
      // scopes" — same with users who skipped the post-login Drive prompt.
      const { error } = await _client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login-callback.html`,
          scopes: 'https://www.googleapis.com/auth/drive.file',
          queryParams: { access_type: 'offline' },
        }
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
    },

    async getProviderToken() {
      const { data: { session } } = await _client.auth.getSession();
      return session?.provider_token ?? null;
    },

    async requestDriveScope() {
      const { error } = await _client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file',
          redirectTo: `${window.location.origin}/login-callback.html`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) console.error('[Auth] requestDriveScope error:', error.message);
    }
  };

  // Set Drive scope flag when a session with provider_token arrives
  _client.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) {
      localStorage.setItem('dermai-drive-scope', 'true');
    } else {
      localStorage.removeItem('dermai-drive-scope');
      localStorage.removeItem('dermai-drive-folder-root');
      localStorage.removeItem('dermai-drive-folder-scans');
      localStorage.removeItem('dermai-drive-folder-progress');
    }
  });
}
