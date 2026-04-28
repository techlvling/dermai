# Phase 2 — Google Drive Photo Storage

**Date:** 2026-04-29
**Status:** Approved
**Builds on:** Phase 1 (Google OAuth + Supabase auth foundation, PR #1)

---

## Overview

Phase 2 adds cloud photo storage to DermAI. Two features share the same Google Drive infrastructure:

1. **Scan photo backup** — after an AI analysis, the user can toggle "Back up to Drive" on the results page. The 3 face photos are uploaded to `DermAI Photos/Scans/` and their URLs are stored in `scans.image_urls` (a column that Phase 1 created but never populated).
2. **Daily progress photo** — a persistent card on the home page lets the user log a single selfie each day. Photos go to `DermAI Photos/Progress/`. Streak counter encourages the habit.

Both features require the `drive.file` OAuth scope, requested once via incremental authorization when the user first opts in — not at sign-in.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Upload path | Frontend → Google Drive API directly | Photos don't travel through our server; no bandwidth cost |
| Drive scope timing | Incremental, on first opt-in | Keeps sign-in consent screen friendly |
| Daily progress photo | Single photo, no AI analysis | It's a photo diary, not a scan |
| Existing IndexedDB photos | Silently migrated to Drive on first opt-in | Consistent with Phase 1 localStorage migration pattern |
| Drive folder structure | `DermAI Photos/Scans/` + `DermAI Photos/Progress/` | Clean separation; Phase 3 can address each independently |
| Folder ID caching | `localStorage['dermai-drive-folder-*']` | Avoids redundant Drive API calls on every page load |

---

## Architecture

### New files

**`frontend/js/drive.js`** — single interface to Google Drive REST API

```
Drive.hasScope()                          → bool (local check, no network)
Drive.requestDriveScope()                 → triggers incremental OAuth via Supabase
Drive.ensureFolder(name, parentId?)       → finds or creates folder; caches ID in localStorage
Drive.uploadPhoto(file, filename, folderId) → multipart upload; returns { id, webViewLink }
Drive.deletePhoto(fileId)                 → trash file in Drive
```

All Drive API calls use `Authorization: Bearer <provider_token>` via a new `Auth.getProviderToken()` method on `auth.js`.

**`frontend/js/progress-photo.js`** — home page card logic

- Reads photo history from `GET /api/progress-photos` (all entries, ordered date desc) to determine today's status and compute streak
- Handles SNAP button: single-photo camera/file picker → resize to 1024px → Drive upload → `POST /api/progress-photos`
- Renders all 4 card states (anonymous, no photo yet, uploading, done)
- Streak is computed from the server response (consecutive days with a photo)

**`backend/routes/photos.js`** — 4 authenticated routes

```
PATCH  /api/scans/:id/images       — set image_urls on an existing scan row
GET    /api/progress-photos        — list all progress photos (ordered date desc)
POST   /api/progress-photos        — upsert { photo_date, drive_file_id, drive_url }
DELETE /api/progress-photos/:date  — delete by date (used by RETAKE)
```

**`supabase/migrations/0002_progress_photos.sql`** — new table + RLS

**IndexedDB migration** — when Drive scope is first granted, `drive.js` reads all entries from `PhotoDB` and uploads each blob to `DermAI Photos/Scans/`. On completion it sets `localStorage['dermai-drive-migrated:<userId>'] = true` to prevent re-migration. Non-fatal if any individual upload fails — the entry is skipped and stays in IndexedDB.

### Modified files

- `frontend/js/auth.js` — add `getProviderToken()`, `requestDriveScope()`
- `frontend/js/upload.js` — add Drive backup toggle (3 states) to results section; call `Drive.uploadPhoto` × 3 when enabled; then `PATCH /api/scans/:id/images`
- `frontend/index.html` — add progress photo card below main Analyze CTA; load `progress-photo.js`
- `backend/server.js` — mount photos router
- `backend/package.json` — no new dependencies (Drive REST API called via plain `fetch`)

---

## Database

```sql
-- supabase/migrations/0002_progress_photos.sql
create table public.progress_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  photo_date    date not null,
  drive_file_id text not null,
  drive_url     text not null,
  created_at    timestamptz default now()
);

create unique index progress_photos_user_date
  on public.progress_photos (user_id, photo_date);

alter table public.progress_photos enable row level security;

create policy "users manage own progress photos"
  on public.progress_photos for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

`scans.image_urls text[]` column already exists (created in `0001_initial.sql`). No schema changes needed to `scans`.

---

## Incremental OAuth flow

1. User toggles Drive backup (or taps SNAP for first time) → `Drive.hasScope()` returns false
2. `Auth.requestDriveScope()` calls:
   ```js
   supabase.auth.signInWithOAuth({
     provider: 'google',
     options: {
       scopes: 'https://www.googleapis.com/auth/drive.file',
       redirectTo: window.location.href,
     }
   })
   ```
3. Google shows Drive-only consent screen (user already logged in, no password)
4. On return, `onAuthStateChange` fires with updated session. `session.provider_token` carries Drive-scoped Google token
5. `localStorage['dermai-drive-scope'] = true` set; future `Drive.hasScope()` calls skip OAuth

---

## UI states

### Scan results — Drive backup toggle

| State | Label | Visual |
|---|---|---|
| Off (default) | BACK UP PHOTOS TO DRIVE | Toggle off (gray, square) |
| Uploading | Uploading 3 photos… (2/3) | Toggle on (black), progress bar below |
| Done | BACKED UP TO DRIVE ✓ | Toggle on, "View in Drive →" link |

Toggle is disabled during upload to prevent double-tap. On revisit, the results page reads `scans.image_urls` to determine initial state.

### Home page — progress photo card

| State | Shown when |
|---|---|
| Grayed out "sign in to start" | Anonymous user |
| Streak dots + SNAP button | Logged in, no photo today |
| Progress bar "Saving to Drive…" | Upload in progress |
| Thumbnail + streak + RETAKE | Today's photo already logged |

Streak is the count of consecutive days ending today with a photo. Displayed as filled/empty 8px squares (matching DermAI's brutalist token system).

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Drive scope not granted | Trigger `requestDriveScope()` → OAuth redirect |
| `provider_token` expired | Drive 401 → re-trigger OAuth, retry once |
| Drive upload fails | Reset toggle to off / SNAP re-enabled; "Upload failed — try again" |
| Drive quota full | "Google Drive full" message with link to manage storage |
| `PATCH /api/scans/:id/images` fails | Non-fatal; photos in Drive but `image_urls` not updated. Logged to console, no user-facing error |
| Drive scope granted but token missing | Re-trigger OAuth (handles edge case of cleared session) |

---

## Testing

**Backend** (`backend/test/photos.test.js`) — 4 new Vitest + Supertest tests using the same factory-function DI pattern as Phase 1:
- `PATCH /api/scans/:id/images` — 200 updates image_urls; 403 if scan belongs to different user
- `GET /api/progress-photos` — 200 returns list
- `POST /api/progress-photos` — 200 upserts; 400 if photo_date missing
- `DELETE /api/progress-photos/:date` — 200 on success

**Frontend `drive.js`** — not unit-tested; covered by manual verification against live Supabase + Drive. Integration-test territory.

---

## File touch list

**Create**
- `frontend/js/drive.js`
- `frontend/js/progress-photo.js`
- `backend/routes/photos.js`
- `backend/test/photos.test.js`
- `supabase/migrations/0002_progress_photos.sql`
- `docs/superpowers/specs/2026-04-29-phase2-drive-storage-design.md` *(this file)*

**Modify**
- `frontend/js/auth.js` — `getProviderToken()`, `requestDriveScope()`
- `frontend/js/upload.js` — Drive backup toggle on results section
- `frontend/index.html` — progress photo card + `progress-photo.js` script tag
- `frontend/css/base.css` — progress card + Drive toggle styles
- `backend/server.js` — mount photos router
- `.gitignore` — `.superpowers/` already added

---

## Out of scope (Phase 3)

- AI photo diff (`/api/compare`) — compares two scan photos from Drive
- Filling `scans.image_urls` from the history page for old scans
- Sharing progress photos or making them public
