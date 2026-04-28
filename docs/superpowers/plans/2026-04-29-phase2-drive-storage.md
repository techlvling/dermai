# Phase 2 — Google Drive Photo Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Drive photo backup for scan results and a daily progress photo card on the home page.

**Architecture:** Frontend calls the Google Drive REST API directly using the user's `provider_token` from Supabase Auth (incremental OAuth for `drive.file` scope). A new `drive.js` module owns all Drive operations. The Express backend only handles metadata: updating `scans.image_urls` and CRUD for the new `progress_photos` table.

**Tech Stack:** Supabase Auth (incremental OAuth), Google Drive REST API v3, Express + Vitest (backend), vanilla JS (frontend), Space Mono brutalist design system.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0002_progress_photos.sql` | Create | `progress_photos` table + RLS |
| `backend/routes/photos.js` | Create | `PATCH /api/scans/:id/images`, CRUD `/api/progress-photos` |
| `backend/test/photos.test.js` | Create | Vitest + Supertest tests for photos routes |
| `backend/server.js` | Modify line 81 | Mount photos router |
| `frontend/js/auth.js` | Modify | Add `getProviderToken()`, `requestDriveScope()` |
| `frontend/js/drive.js` | Create | Drive API wrapper (folder, upload, delete, migrate) |
| `frontend/css/base.css` | Modify (append) | Drive toggle + progress card styles |
| `frontend/js/upload.js` | Modify lines 520, 523–541 | Capture scan ID; add Drive backup toggle |
| `frontend/js/progress-photo.js` | Create | Home page daily photo card logic |
| `frontend/index.html` | Modify lines 84–85 | Add progress card mount point + script tag |

---

## Task 1: Database — progress_photos table

**Files:**
- Create: `supabase/migrations/0002_progress_photos.sql`

- [ ] **Step 1: Write the migration file**

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

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with:
- `project_id`: your Supabase project ID (from dashboard URL or `get_project`)
- `name`: `progress_photos`
- `query`: the SQL above

- [ ] **Step 3: Verify the table exists**

Use `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'progress_photos'
order by ordinal_position;
```

Expected: 6 rows — `id`, `user_id`, `photo_date`, `drive_file_id`, `drive_url`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_progress_photos.sql
git commit -m "feat(db): add progress_photos table with RLS"
```

---

## Task 2: Backend — photos router (TDD)

**Files:**
- Create: `backend/test/photos.test.js`
- Create: `backend/routes/photos.js`
- Modify: `backend/server.js` (line 81, after reactions route)

- [ ] **Step 1: Write failing tests**

Create `backend/test/photos.test.js`:

```js
const request = require('supertest');
const express = require('express');
const createPhotosRouter = require('../routes/photos.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyAuth = (req, res, next) => {
  req.user = { id: 'user-123' };
  req.supabaseToken = 'tok';
  next();
};

const app = express();
app.use(express.json());
app.use(createPhotosRouter(mockVerifyAuth, mockGetSupabaseAdmin));

describe('photos routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCH /api/scans/:id/images — 200 updates image_urls', async () => {
    const updated = { id: 'scan-1', user_id: 'user-123', image_urls: ['u1', 'u2', 'u3'] };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: updated, error: null }) });

    const res = await request(app)
      .patch('/api/scans/scan-1/images')
      .send({ image_urls: ['u1', 'u2', 'u3'] });
    expect(res.status).toBe(200);
    expect(res.body.scan).toEqual(updated);
  });

  it('PATCH /api/scans/:id/images — 400 when image_urls missing', async () => {
    const res = await request(app).patch('/api/scans/scan-1/images').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image_urls/);
  });

  it('GET /api/progress-photos — 200 returns list', async () => {
    const photos = [{ id: '1', user_id: 'user-123', photo_date: '2026-04-29', drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' }];
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: photos, error: null }) });

    const res = await request(app).get('/api/progress-photos');
    expect(res.status).toBe(200);
    expect(res.body.photos).toEqual(photos);
  });

  it('POST /api/progress-photos — 200 upserts', async () => {
    const saved = { id: '1', user_id: 'user-123', photo_date: '2026-04-29', drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' };
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: saved, error: null }) });

    const res = await request(app)
      .post('/api/progress-photos')
      .send({ photo_date: '2026-04-29', drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' });
    expect(res.status).toBe(200);
    expect(res.body.photo).toEqual(saved);
  });

  it('POST /api/progress-photos — 400 when photo_date missing', async () => {
    const res = await request(app)
      .post('/api/progress-photos')
      .send({ drive_file_id: 'abc', drive_url: 'https://drive.google.com/file/abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photo_date/);
  });

  it('DELETE /api/progress-photos/:date — 200 on success', async () => {
    mockGetSupabaseAdmin.mockReturnValue({ from: () => makeChain({ data: [], error: null }) });

    const res = await request(app).delete('/api/progress-photos/2026-04-29');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: 6 failures — `Cannot find module '../routes/photos.js'`

- [ ] **Step 3: Create the photos router**

Create `backend/routes/photos.js`:

```js
const express = require('express');

function createPhotosRouter(verifyAuth, getSupabaseAdmin) {
  const router = express.Router();
  router.use(verifyAuth);

  // PATCH /api/scans/:id/images
  router.patch('/api/scans/:id/images', async (req, res) => {
    const { image_urls } = req.body;
    if (!image_urls || !Array.isArray(image_urls)) {
      return res.status(400).json({ error: 'image_urls array is required' });
    }
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('scans')
      .update({ image_urls })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ scan: data });
  });

  // GET /api/progress-photos
  router.get('/api/progress-photos', async (req, res) => {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('progress_photos')
      .select('*')
      .eq('user_id', req.user.id)
      .order('photo_date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ photos: data });
  });

  // POST /api/progress-photos
  router.post('/api/progress-photos', async (req, res) => {
    const { photo_date, drive_file_id, drive_url } = req.body;
    if (!photo_date) return res.status(400).json({ error: 'photo_date is required' });
    if (!drive_file_id) return res.status(400).json({ error: 'drive_file_id is required' });
    if (!drive_url) return res.status(400).json({ error: 'drive_url is required' });
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('progress_photos')
      .upsert(
        { user_id: req.user.id, photo_date, drive_file_id, drive_url },
        { onConflict: 'user_id,photo_date' }
      )
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ photo: data });
  });

  // DELETE /api/progress-photos/:date
  router.delete('/api/progress-photos/:date', async (req, res) => {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from('progress_photos')
      .delete()
      .eq('user_id', req.user.id)
      .eq('photo_date', req.params.date);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  });

  return router;
}

module.exports = createPhotosRouter;
```

- [ ] **Step 4: Run tests — verify all 6 pass**

```bash
cd backend && npm test 2>&1 | tail -8
```

Expected: `Tests  29 passed (29)` (23 existing + 6 new)

- [ ] **Step 5: Mount router in server.js**

In `backend/server.js`, add after line 81 (after the reactions route):

```js
app.use(require('./routes/photos')(verifyAuth, getSupabaseAdmin));
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/photos.js backend/test/photos.test.js backend/server.js
git commit -m "feat(backend): add photos router — scan image_urls + progress photos CRUD"
```

---

## Task 3: Frontend auth.js — getProviderToken + requestDriveScope

**Files:**
- Modify: `frontend/js/auth.js`

- [ ] **Step 1: Add two methods to the Auth object**

In `frontend/js/auth.js`, inside the `window.Auth = { ... }` object, add after the existing `onAuthStateChange` method (currently the last method):

```js
    async getProviderToken() {
      const { data: { session } } = await _client.auth.getSession();
      return session?.provider_token ?? null;
    },

    async requestDriveScope() {
      const { error } = await _client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file',
          redirectTo: window.location.href,
        },
      });
      if (error) console.error('[Auth] requestDriveScope error:', error.message);
    },
```

Also add this block inside `_client.auth.onAuthStateChange` to set the Drive scope flag when the session updates. Find the existing `onAuthStateChange` call site in `migration.js` or add a listener in auth.js itself. Add at the end of the `window.Auth` block (outside the object, after the closing `}`):

```js
  // Set Drive scope flag when a session with provider_token arrives
  _client.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) {
      localStorage.setItem('dermai-drive-scope', 'true');
    }
  });
```

- [ ] **Step 2: Verify auth.js loads without errors**

Open `frontend/index.html` in a browser (via the dev server: `cd backend && npm run dev`). Open DevTools console. Should see no errors from auth.js. `window.Auth.getProviderToken` should be a function.

- [ ] **Step 3: Commit**

```bash
git add frontend/js/auth.js
git commit -m "feat(auth): add getProviderToken and requestDriveScope for Drive incremental OAuth"
```

---

## Task 4: Frontend drive.js — Drive API wrapper

**Files:**
- Create: `frontend/js/drive.js`

- [ ] **Step 1: Create drive.js**

```js
(() => {
  const DRIVE_API        = 'https://www.googleapis.com/drive/v3';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE_KEY        = 'dermai-drive-scope';
  const FOLDER_ROOT_KEY  = 'dermai-drive-folder-root';
  const FOLDER_SCANS_KEY = 'dermai-drive-folder-scans';
  const FOLDER_PROG_KEY  = 'dermai-drive-folder-progress';

  function hasScope() {
    return localStorage.getItem(SCOPE_KEY) === 'true';
  }

  async function requestDriveScope() {
    if (window.Auth) await window.Auth.requestDriveScope();
  }

  async function _token() {
    const t = window.Auth ? await window.Auth.getProviderToken() : null;
    if (!t) throw new Error('Drive: no provider_token — call requestDriveScope() first');
    return t;
  }

  async function _apiFetch(url, opts = {}) {
    const token = await _token();
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      // 401 means token expired — caller should re-trigger OAuth
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error?.message || `Drive API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function _ensureFolder(name, parentId, cacheKey) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const search = await _apiFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    if (search.files.length > 0) {
      localStorage.setItem(cacheKey, search.files[0].id);
      return search.files[0].id;
    }

    const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];
    const created = await _apiFetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });
    localStorage.setItem(cacheKey, created.id);
    return created.id;
  }

  async function ensureScansFolder() {
    const root = await _ensureFolder('DermAI Photos', null, FOLDER_ROOT_KEY);
    return _ensureFolder('Scans', root, FOLDER_SCANS_KEY);
  }

  async function ensureProgressFolder() {
    const root = await _ensureFolder('DermAI Photos', null, FOLDER_ROOT_KEY);
    return _ensureFolder('Progress', root, FOLDER_PROG_KEY);
  }

  async function uploadPhoto(file, filename, folderId) {
    const token = await _token();
    const meta  = { name: filename, parents: [folderId] };
    const form  = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message || `Drive upload ${res.status}`);
    }
    return res.json(); // { id, webViewLink }
  }

  async function deletePhoto(fileId) {
    await _apiFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  }

  // Silently migrate existing PhotoDB blobs to DermAI Photos/Scans/ on first Drive grant.
  async function migrateFromIndexedDB(userId) {
    const key = `dermai-drive-migrated:${userId}`;
    if (localStorage.getItem(key) || typeof PhotoDB === 'undefined') return;
    try {
      const photos = await PhotoDB.getAll();
      if (!photos.length) { localStorage.setItem(key, 'true'); return; }
      const folderId = await ensureScansFolder();
      for (const photo of photos) {
        try {
          const date = new Date(photo.scanAt).toISOString().slice(0, 10);
          const file = new File([photo.blob], `migrated-scan-${date}.jpg`, { type: 'image/jpeg' });
          await uploadPhoto(file, `scan-${date}-front.jpg`, folderId);
        } catch (e) {
          console.warn('[Drive] migration skip:', photo.id, e.message);
        }
      }
      localStorage.setItem(key, 'true');
    } catch (e) {
      console.warn('[Drive] migrateFromIndexedDB failed:', e.message);
    }
  }

  window.Drive = { hasScope, requestDriveScope, ensureScansFolder, ensureProgressFolder, uploadPhoto, deletePhoto, migrateFromIndexedDB };
})();
```

- [ ] **Step 2: Verify drive.js loads**

Add `<script src="/js/drive.js"></script>` temporarily to `index.html` after `auth.js`. Open the home page in a browser. In DevTools console: `typeof window.Drive.hasScope` should return `"function"`. Remove the temporary script tag when done (Task 7 adds it permanently).

- [ ] **Step 3: Commit**

```bash
git add frontend/js/drive.js
git commit -m "feat(frontend): add drive.js — Drive API wrapper with folder cache and IndexedDB migration"
```

---

## Task 5: CSS — Drive toggle + progress card styles

**Files:**
- Modify: `frontend/css/base.css` (append to end of file, after line 462)

- [ ] **Step 1: Append styles to base.css**

Add at the end of `frontend/css/base.css`:

```css
/* ── Drive backup toggle (results page) ──────────────────────────────────── */
.drive-backup {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 2px solid #000;
}
.drive-backup__row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}
.drive-backup__label {
  font-family: 'Space Mono', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.drive-backup__hint {
  font-family: 'Space Mono', monospace;
  font-size: 0.6875rem;
  color: #666;
  margin-top: 0.2rem;
}
.drive-backup__hint a {
  color: #000;
}
.drive-toggle {
  flex-shrink: 0;
  margin-left: auto;
  width: 40px;
  height: 20px;
  background: #ccc;
  border: 2px solid #999;
  border-radius: 0;
  cursor: pointer;
  position: relative;
  padding: 0;
  transition: background 0.1s, border-color 0.1s;
}
.drive-toggle::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background: #fff;
  border: 1px solid #aaa;
  top: 1px;
  left: 1px;
  transition: left 0.1s, border-color 0.1s;
}
.drive-toggle[aria-checked="true"] {
  background: #000;
  border-color: #000;
}
.drive-toggle[aria-checked="true"]::after {
  left: calc(100% - 15px);
  border-color: #fff;
}
.drive-toggle[disabled],
.drive-toggle.uploading {
  opacity: 0.5;
  cursor: not-allowed;
}
.drive-backup__bar {
  height: 4px;
  background: #ddd;
  margin-top: 0.5rem;
}
.drive-backup__fill {
  height: 100%;
  background: #000;
  width: 0%;
  transition: width 0.25s;
}

/* ── Daily progress photo card (home page) ───────────────────────────────── */
.progress-card {
  border: 2px solid #000;
  box-shadow: 4px 4px 0 #000;
  padding: 1rem 1.25rem;
  background: #fff;
  margin-top: 1.25rem;
}
.progress-card--anonymous {
  opacity: 0.55;
  background: #f5f5f5;
  box-shadow: none;
}
.progress-card__row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}
.progress-card__icon {
  font-size: 1.5rem;
  line-height: 1;
  flex-shrink: 0;
}
.progress-card__thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 2px solid #000;
  flex-shrink: 0;
}
.progress-card__label {
  font-family: 'Space Mono', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.progress-card__sub {
  font-family: 'Space Mono', monospace;
  font-size: 0.6875rem;
  color: #666;
  margin-top: 0.2rem;
}
.progress-card__streak {
  display: flex;
  gap: 3px;
  margin-top: 0.4rem;
}
.progress-card__dot {
  width: 8px;
  height: 8px;
  background: #000;
  flex-shrink: 0;
}
.progress-card__dot--empty {
  background: #ddd;
  border: 1px solid #aaa;
}
.progress-card__bar {
  height: 4px;
  background: #ddd;
  margin-top: 0.5rem;
}
.progress-card__fill {
  height: 100%;
  background: #000;
  width: 0%;
  transition: width 0.25s;
}
```

- [ ] **Step 2: Verify no CSS errors**

Open the browser DevTools → Console. Reload any page. No CSS parse errors should appear.

- [ ] **Step 3: Commit**

```bash
git add frontend/css/base.css
git commit -m "feat(css): add Drive toggle and progress card styles"
```

---

## Task 6: upload.js — Drive backup toggle on results

**Files:**
- Modify: `frontend/js/upload.js` (lines 520 and 523–541)

- [ ] **Step 1: Capture scan ID and add Drive toggle**

Replace lines 518–541 in `frontend/js/upload.js` (from `localStorage.setItem` to end of `renderResults`) with:

```js
    localStorage.setItem('dermAI_analysis', JSON.stringify(data));
    const history = saveToHistory(data);

    // Capture scan ID for Drive backup (resolves asynchronously)
    let savedScanId = null;
    Storage.server.post('/api/scans', { result_json: data })
      .then(r => { savedScanId = r?.scan?.id ?? null; })
      .catch(() => {});

    renderHistory(history);

    // Soft gate: sign-in CTA for anonymous users
    Storage.isLoggedIn().then(async loggedIn => {
      if (!loggedIn) {
        const saveGate = document.createElement('div');
        saveGate.className = 'save-gate';
        saveGate.style.cssText = 'margin-top:1.5rem; padding:1.25rem 1.5rem; border:2px solid #000; box-shadow:4px 4px 0 #000; background:#fff; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;';
        saveGate.innerHTML = `
          <p class="save-gate__msg" style="margin:0; font-family:'Space Mono',monospace; font-size:0.875rem; font-weight:700; text-transform:uppercase; letter-spacing:0.02em;">Sign in to save this analysis across devices</p>
          <button class="btn btn-primary" id="save-gate-btn" style="white-space:nowrap;">SIGN IN WITH GOOGLE</button>
        `;
        if (!resultsSection.querySelector('.save-gate')) resultsSection.appendChild(saveGate);
        saveGate.querySelector('#save-gate-btn').addEventListener('click', () => {
          if (window.Auth) window.Auth.signInWithGoogle();
        });
        return;
      }

      if (typeof Drive === 'undefined') return;

      // Drive backup toggle
      const ANGLE_LABELS = ['front', 'left', 'right'];
      const driveSection = document.createElement('div');
      driveSection.className = 'drive-backup';
      driveSection.innerHTML = `
        <div class="drive-backup__row">
          <div>
            <div class="drive-backup__label">BACK UP PHOTOS TO DRIVE</div>
            <div class="drive-backup__hint">Save these 3 photos to your Google Drive</div>
          </div>
          <button class="drive-toggle" id="drive-toggle" role="switch" aria-checked="false" aria-label="Back up photos to Drive"></button>
        </div>
        <div class="drive-backup__bar" id="drive-bar" style="display:none">
          <div class="drive-backup__fill" id="drive-fill"></div>
        </div>
      `;
      resultsSection.appendChild(driveSection);

      const toggle = document.getElementById('drive-toggle');
      const bar    = document.getElementById('drive-bar');
      const fill   = document.getElementById('drive-fill');
      const label  = driveSection.querySelector('.drive-backup__label');
      const hint   = driveSection.querySelector('.drive-backup__hint');

      toggle.addEventListener('click', async () => {
        if (toggle.classList.contains('uploading')) return;
        if (toggle.getAttribute('aria-checked') === 'true') return;

        if (!Drive.hasScope()) {
          // Warn user they'll be redirected (photos in memory will be lost)
          hint.textContent = 'Redirecting to Google for permission…';
          await Drive.requestDriveScope();
          return; // page redirects
        }

        toggle.classList.add('uploading');
        toggle.setAttribute('aria-checked', 'true');
        bar.style.display = 'block';

        try {
          const folderId   = await Drive.ensureScansFolder();
          const filesToUp  = capturedFiles.filter(Boolean);
          const urls       = [];

          for (let i = 0; i < filesToUp.length; i++) {
            const date     = new Date(data.savedAt).toISOString().slice(0, 10);
            const filename = `scan-${date}-${ANGLE_LABELS[i]}.jpg`;
            hint.textContent = `Uploading ${filesToUp.length} photos… (${i + 1}/${filesToUp.length})`;
            fill.style.width = `${Math.round(((i) / filesToUp.length) * 100)}%`;
            const result = await Drive.uploadPhoto(filesToUp[i], filename, folderId);
            urls.push(result.webViewLink);
          }
          fill.style.width = '100%';

          // Update Postgres image_urls (non-fatal if it fails)
          if (savedScanId) {
            fetch(`/api/scans/${savedScanId}/images`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await window.Auth.getToken()}`,
              },
              body: JSON.stringify({ image_urls: urls }),
            }).catch(e => console.warn('[Drive] PATCH scans images failed:', e.message));
          }

          // Trigger IndexedDB migration now that scope is active
          const user = await window.Auth.getUser();
          if (user) Drive.migrateFromIndexedDB(user.id).catch(() => {});

          label.textContent = 'BACKED UP TO DRIVE ✓';
          const scanFolderId = localStorage.getItem('dermai-drive-folder-scans') || '';
          hint.innerHTML = `${filesToUp.length} photos saved · <a href="https://drive.google.com/drive/folders/${scanFolderId}" target="_blank" rel="noopener">View in Drive →</a>`;
          bar.style.display = 'none';
        } catch (err) {
          console.error('[Drive] backup failed:', err.message);
          label.textContent = 'BACK UP PHOTOS TO DRIVE';
          hint.textContent  = err.message.includes('quota') ? 'Google Drive is full — manage your storage.' : 'Upload failed — try again';
          toggle.classList.remove('uploading');
          toggle.setAttribute('aria-checked', 'false');
          bar.style.display = 'none';
        }
      });
    });
  }
```

Note: this replacement covers from `localStorage.setItem('dermAI_analysis'…` to the closing `}` of `renderResults`. The function closing `});` on line 542 stays.

- [ ] **Step 2: Add drive.js script tag to analyze.html**

In `frontend/analyze.html`, find the existing script tags near the bottom and add:

```html
<script src="/js/drive.js"></script>
```

immediately before the `<script src="/js/upload.js" ...>` tag.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`cd backend && npm run dev`). Run a scan. After results appear:
- If logged in: Drive backup toggle appears. Clicking it without Drive scope granted should update the hint text to "Redirecting to Google for permission…" and trigger OAuth.
- After Drive scope granted (return from OAuth), toggle should upload all photos and show "BACKED UP TO DRIVE ✓".

- [ ] **Step 4: Commit**

```bash
git add frontend/js/upload.js frontend/analyze.html
git commit -m "feat(frontend): Drive backup toggle on scan results — 3-state UI with progress bar"
```

---

## Task 7: progress-photo.js + index.html — daily photo card

**Files:**
- Create: `frontend/js/progress-photo.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Create progress-photo.js**

```js
(() => {
  const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD local

  function _computeStreak(photos) {
    // photos ordered date desc from server
    if (!photos.length) return 0;
    let streak = 0;
    const d = new Date(TODAY);
    for (const p of photos) {
      const pDate = p.photo_date; // YYYY-MM-DD string
      const expected = d.toISOString().slice(0, 10);
      if (pDate !== expected) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function _streakDots(streak, total = 7) {
    const dots = [];
    for (let i = 0; i < total; i++) {
      const filled = i < Math.min(streak, total);
      dots.push(`<div class="progress-card__dot${filled ? '' : ' progress-card__dot--empty'}"></div>`);
    }
    return dots.join('');
  }

  function _resizeImage(file, callback) {
    const MAX = 1024;
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => callback(new File([blob], file.name, { type: 'image/jpeg' }), canvas.toDataURL('image/jpeg', 0.82)), 'image/jpeg', 0.82);
    };
    img.src = URL.createObjectURL(file);
  }

  async function _uploadAndSave(file, card) {
    const label = card.querySelector('.progress-card__label');
    const sub   = card.querySelector('.progress-card__sub');
    const bar   = card.querySelector('.progress-card__bar');
    const fill  = card.querySelector('.progress-card__fill');

    label.textContent = 'DAILY PROGRESS PHOTO';
    sub.textContent   = 'Saving to Drive…';
    bar.style.display = 'block';
    fill.style.width  = '30%';

    try {
      const folderId = await Drive.ensureProgressFolder();
      fill.style.width = '60%';
      const result = await Drive.uploadPhoto(file, `progress-${TODAY}.jpg`, folderId);
      fill.style.width = '90%';

      const token = await window.Auth.getToken();
      await fetch('/api/progress-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photo_date: TODAY, drive_file_id: result.id, drive_url: result.webViewLink }),
      });

      fill.style.width = '100%';
      setTimeout(() => _renderDone(card, result.webViewLink, 1), 300);
    } catch (err) {
      console.error('[ProgressPhoto] upload failed:', err.message);
      bar.style.display = 'none';
      label.textContent = 'DAILY PROGRESS PHOTO';
      sub.textContent   = 'Upload failed — try again';
    }
  }

  function _renderAnonymous(card) {
    card.className = 'progress-card progress-card--anonymous';
    card.innerHTML = `
      <div class="progress-card__row">
        <div class="progress-card__icon">📸</div>
        <div>
          <div class="progress-card__label">DAILY PROGRESS PHOTO</div>
          <div class="progress-card__sub">Sign in to start your photo streak</div>
        </div>
      </div>`;
  }

  function _renderReady(card, streak) {
    card.className = 'progress-card';
    card.innerHTML = `
      <div class="progress-card__row">
        <div class="progress-card__icon">📸</div>
        <div style="flex:1; min-width:0;">
          <div class="progress-card__label">DAILY PROGRESS PHOTO</div>
          <div class="progress-card__sub">${TODAY} · no photo yet</div>
          <div class="progress-card__streak">${_streakDots(streak)}</div>
          ${streak > 0 ? `<div class="progress-card__sub" style="margin-top:3px;">${streak}-day streak${streak >= 3 ? ' 🔥' : ''}</div>` : ''}
        </div>
        <button class="btn btn-primary progress-card__snap" id="progress-snap-btn" style="flex-shrink:0;">+ SNAP</button>
      </div>
      <div class="progress-card__bar" style="display:none"><div class="progress-card__fill"></div></div>`;

    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'user'; input.style.display = 'none';
    card.appendChild(input);

    card.querySelector('#progress-snap-btn').addEventListener('click', async () => {
      if (!Drive.hasScope()) {
        card.querySelector('.progress-card__sub').textContent = 'Redirecting to Google for permission…';
        await Drive.requestDriveScope();
        return;
      }
      input.click();
    });

    input.addEventListener('change', e => {
      if (e.target.files[0]) {
        _resizeImage(e.target.files[0], file => _uploadAndSave(file, card));
        input.value = '';
      }
    });
  }

  function _renderDone(card, driveUrl, streak) {
    card.className = 'progress-card';
    const progFolderId = localStorage.getItem('dermai-drive-folder-progress') || '';
    card.innerHTML = `
      <div class="progress-card__row">
        <img class="progress-card__thumb" src="${driveUrl}" alt="Today's progress photo" onerror="this.style.display='none'">
        <div style="flex:1; min-width:0;">
          <div class="progress-card__label">TODAY'S PHOTO SAVED ✓</div>
          <div class="progress-card__sub">${TODAY}</div>
          <div class="progress-card__streak">${_streakDots(streak)}</div>
          ${streak > 0 ? `<div class="progress-card__sub" style="margin-top:3px;">${streak}-day streak${streak >= 3 ? ' 🔥' : ''}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;flex-shrink:0;">
          <button class="btn btn-ghost progress-card__retake" id="progress-retake-btn" style="font-size:0.7rem;padding:4px 8px;">RETAKE</button>
          <a href="https://drive.google.com/drive/folders/${progFolderId}" target="_blank" rel="noopener" style="font-family:'Space Mono',monospace;font-size:0.65rem;color:#666;">View →</a>
        </div>
      </div>`;

    card.querySelector('#progress-retake-btn').addEventListener('click', async () => {
      const token = await window.Auth.getToken();
      await fetch(`/api/progress-photos/${TODAY}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      // Re-render as ready state, preserve streak - 1
      _renderReady(card, Math.max(0, streak - 1));
    });
  }

  async function init() {
    const mount = document.getElementById('progress-card-mount');
    if (!mount) return;

    const card = document.createElement('div');
    card.className = 'progress-card';
    mount.appendChild(card);

    if (!window.Auth) { _renderAnonymous(card); return; }

    const user = await window.Auth.getUser();
    if (!user) { _renderAnonymous(card); return; }

    // Fetch photo history
    let photos = [];
    try {
      const token = await window.Auth.getToken();
      const r = await fetch('/api/progress-photos', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) ({ photos } = await r.json());
    } catch (_) { /* offline — show ready state */ }

    const todayPhoto = photos.find(p => p.photo_date === TODAY);
    const streak     = _computeStreak(photos);

    if (todayPhoto) {
      _renderDone(card, todayPhoto.drive_url, streak);
    } else {
      _renderReady(card, streak);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Add progress card mount point and scripts to index.html**

In `frontend/index.html`, after line 85 (after the `.hero-actions` div that contains the "Analyze my skin" button):

```html
          <div id="progress-card-mount"></div>
```

Then near the bottom of `index.html`, after `<script src="/js/migration.js"></script>` (around line 414), add:

```html
    <script src="/js/drive.js"></script>
    <script src="/js/progress-photo.js" defer></script>
```

- [ ] **Step 3: Manual smoke test**

Open the home page while logged in. The progress card should appear below the "Analyze my skin →" button. First time: shows SNAP button. After tapping SNAP (with Drive scope), photo uploads to Drive and card shows "TODAY'S PHOTO SAVED ✓". RETAKE deletes the photo from Postgres and re-renders the ready state.

Open the home page while logged out: card appears grayed out with "Sign in to start your photo streak".

- [ ] **Step 4: Commit**

```bash
git add frontend/js/progress-photo.js frontend/index.html
git commit -m "feat(frontend): daily progress photo card on home page with streak counter"
```

---

## Task 8: Verification checklist

- [ ] **Backend tests still all green**

```bash
cd backend && npm test 2>&1 | tail -5
```

Expected: `Tests  29 passed (29)`

- [ ] **Scan photo backup end-to-end**
  1. Sign in with Google
  2. Run a skin analysis on `/analyze.html`
  3. Drive backup toggle appears in results
  4. If Drive scope not yet granted: click toggle → redirected to Google → grants Drive access → redirected back → run analysis again → click toggle → photos upload
  5. Toggle shows "BACKED UP TO DRIVE ✓" and "View in Drive →" link
  6. Open Drive link — `DermAI Photos/Scans/` folder contains the uploaded photos
  7. In Supabase dashboard: `select image_urls from scans order by created_at desc limit 1` — should have 3 URLs

- [ ] **Daily progress photo end-to-end**
  1. Open home page while signed in
  2. Progress card shows below "Analyze my skin →" button
  3. Tap SNAP → if Drive scope not yet granted, OAuth redirects → on return, tap SNAP again
  4. Camera/file picker opens → select a photo → card shows progress bar then "TODAY'S PHOTO SAVED ✓"
  5. Check Drive: `DermAI Photos/Progress/progress-YYYY-MM-DD.jpg` exists
  6. Check Supabase: `select * from progress_photos order by created_at desc limit 1` — row present

- [ ] **Anonymous user**
  1. Open home page in incognito
  2. Progress card shows grayed out with "Sign in to start your photo streak"
  3. No Drive toggle appears on results page

- [ ] **RETAKE**
  1. Tap RETAKE on a completed progress card
  2. Card reverts to SNAP state
  3. `select count(*) from progress_photos where photo_date = CURRENT_DATE` → 0

- [ ] **Final commit**

```bash
git add -A
git status  # should be clean
git push origin feature/phase1-auth
```

---

## Notes for implementer

**Drive scope and page redirect:** When a user clicks Drive backup before granting the `drive.file` scope, `requestDriveScope()` redirects the page to Google's OAuth consent. After consenting, Google redirects back to the same URL. This means any analysis results currently on the results page are lost. This is a known UX limitation for the first-time experience — subsequent analyses work without any redirect because the scope is already granted and cached in `localStorage['dermai-drive-scope']`.

**`provider_token` lifetime:** Supabase stores the `provider_token` (the real Google OAuth token) in the session. It expires after ~1 hour. The `onAuthStateChange` listener in `auth.js` re-sets `dermai-drive-scope` whenever a new session with a `provider_token` arrives (i.e., after token refresh). If a Drive API call returns 401, the user must re-trigger `requestDriveScope()`.

**Folder ID cache invalidation:** If a user deletes the `DermAI Photos` folder in Drive, the cached folder ID in localStorage will be stale and Drive API calls will return 404. The fix is to clear `dermai-drive-folder-*` keys from localStorage. This is an edge case not handled in Phase 2.
