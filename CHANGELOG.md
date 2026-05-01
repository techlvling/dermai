# Changelog

## Unreleased

### Removed

- Groq fallback provider — `getGroqClient`, `lib/ai-models.js`, `GROQ_API_KEY` env var, and the Groq mention in privacy.html. `/api/analyze` and `/api/compare` now rely solely on the OpenRouter model chain.

## [1.2.0] — 2026-04-29

### Phase 2 — Google Drive photo storage + daily progress tracking

- Google Drive backup: scans and daily progress photos optionally saved to user's Drive folder via OAuth scope `drive.file`
- Daily progress photo card on home page with streak counter (IndexedDB + Drive sync)
- `POST /api/scans/:id/images` — store Drive thumbnail + view URLs against a scan record
- `frontend/js/drive.js` — Drive OAuth, upload, thumbnail fetch, IndexedDB migration
- `frontend/js/progress-photo.js` — daily capture widget, streak logic, calendar heatmap

### Phase 3 — AI skin comparison

- `POST /api/compare` — side-by-side AI narrative comparing two scans (visual mode with Drive photos, text-only fallback)
- Compare button on history cards with arbitrary-scan picker (choose any two scans)
- Compare narrative cached server-side to avoid redundant AI calls
- Per-user rate limit on `/api/compare` (5 req / 15 min)
- Scroll-spy active nav state on all pages

### Groq fallback

- Added Groq as secondary AI provider (`meta-llama/llama-4-scout-17b-16e-instruct`, `llama-4-maverick`) after OpenRouter chain exhausts for both `/api/analyze` and `/api/compare`
- `GROQ_API_KEY` added to `.env.example`

### Design system overhaul

- Soft Brutalist audit: eliminated all `border-radius` values from `.upload-slot`, `#camera-feed`, `.thumbnail`, `.severity-badge`, `.hc-compare-photos img` — now consistently 0px per DESIGN.md
- Touch target fixes: `.btn-ghost` and `.footer-minimal a` both raised to `min-height: 44px`

### Analytics & error messages

- Vercel Analytics (`/_vercel/insights/script.js`) added to all 8 HTML pages
- Replaced `alert()` calls for camera/file errors with inline styled error divs
- Replaced developer-facing error messages ("Is the backend running?", "set OPENROUTER_API_KEY…") with user-safe copy

### Tests

- 43/43 passing (Vitest + Supertest) — added compare route tests

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

Anonymous-only tinkskin: scan analysis, ingredient lookup, product recommendations, routine tracking, reaction log, shopping list. All state in localStorage / IndexedDB.
