# Changelog

## [1.1.0] — 2026-04-28

### Phase 1 — Google OAuth + Supabase auth foundation

**Backend**
- Add `verifyAuth` middleware (`backend/middleware/auth.js`) — validates Supabase JWT from `Authorization: Bearer` header, attaches `req.user` and `req.supabaseToken`, returns 401/502 on failure
- Add shared Supabase server client (`backend/lib/supabase.js`) — singleton admin client (service-role key) + factory for per-request anon clients
- Add authenticated REST routes: `GET/POST/DELETE /api/scans`, `GET/POST/DELETE /api/favorites`, `GET/POST /api/routine`, `GET/POST/DELETE /api/reactions`
- Wire new routes into `server.js`; add `Authorization` to CORS allowed headers
- Add `@supabase/supabase-js` dependency
- **Tests**: Vitest 4 + Supertest — 23/23 passing across middleware and all four route groups; routes exported as factory functions for dependency-injection mocking (no module-system mocking required)

**Frontend**
- Add `frontend/js/auth.js` — thin Supabase JS SDK wrapper (`signInWithGoogle`, `signOut`, `getUser`, `onAuthStateChange`)
- Add `frontend/js/migration.js` — auto-imports localStorage data (scans, favorites, routine, reactions) on first sign-in; idempotent
- Extend `frontend/js/storage.js` with auth-aware dual-write: server + localStorage when signed in, localStorage-only when anonymous; same public API
- Add user-menu chip (avatar + email / "Sign in" button) to all six HTML pages via `auth.js` + Supabase CDN script
- Add `frontend/login-callback.html` — OAuth redirect target that exchanges code for session and redirects home

**Database**
- Add `supabase/migrations/0001_initial.sql` — `profiles`, `scans`, `favorites`, `routine_logs`, `reactions` tables with RLS policies (`auth.uid() = user_id` for all CRUD)

**Docs / config**
- `README.md` — Supabase setup section, new env vars, local dev instructions
- `backend/.env.example` — document `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## [1.0.0] — initial release

Anonymous-only DermAI: scan analysis, ingredient lookup, product recommendations, routine tracking, reaction log, shopping list. All state in localStorage / IndexedDB.
