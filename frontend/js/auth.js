// Replace these with your Supabase project values from: supabase.com → Project Settings → API
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: 'dermai-auth' }
});

const Auth = {
  // Sign in with Google OAuth — opens a popup
  async signInWithGoogle() {
    const { error } = await _client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login-callback.html`
      }
    });
    if (error) console.error('[Auth] signInWithGoogle error:', error.message);
  },

  // Sign out the current user
  async signOut() {
    const { error } = await _client.auth.signOut();
    if (error) console.error('[Auth] signOut error:', error.message);
  },

  // Get current user (null if not signed in)
  async getUser() {
    const { data: { user } } = await _client.auth.getUser();
    return user;
  },

  // Get the current session's access token (for API calls)
  async getToken() {
    const { data: { session } } = await _client.auth.getSession();
    return session?.access_token ?? null;
  },

  // Register a callback for auth state changes
  // callback receives (event, session) — event is 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' etc.
  onAuthStateChange(callback) {
    return _client.auth.onAuthStateChange(callback);
  }
};

window.Auth = Auth;
