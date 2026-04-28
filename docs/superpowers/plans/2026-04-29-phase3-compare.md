# Phase 3 — AI Skin Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Compare ↕" button to history cards that sends two Drive scan photos to an OpenRouter vision model and renders a side-by-side comparison with an AI dermatologist narrative inline on the history page.

**Architecture:** Frontend fetches Drive image blobs using the user's Google token (`window.Auth.getProviderToken()`), posts them as multipart to a new `POST /api/compare` Express route, which verifies scan ownership via Supabase and calls OpenRouter vision. The Google token never touches the server.

**Tech Stack:** Node.js/Express, Supabase JS v2, multer, OpenRouter (OpenAI-compatible SDK), vanilla JS, CSS custom properties.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `frontend/js/auth.js` | Modify | Fix `requestDriveScope()` redirectTo (BUG-001) |
| `backend/test/helpers.js` | Modify | Add `.in()` to chainable mock |
| `backend/routes/compare.js` | Create | `POST /api/compare` handler |
| `backend/test/compare.test.js` | Create | Vitest tests for compare route |
| `backend/server.js` | Modify | Register compare route |
| `frontend/js/history.js` | Modify | Merge fix, render() index tracking, compareScans() |
| `frontend/css/history.css` | Modify | Three new rule blocks for compare panel |

---

## Task 1: Fix BUG-001 — requestDriveScope redirectTo

**Files:**
- Modify: `frontend/js/auth.js:54`

`signInWithGoogle()` already uses the correct redirectTo (line 20). Only `requestDriveScope()` still uses `window.location.href`, which triggers implicit flow during local dev and exposes tokens in the URL hash.

- [ ] **Step 1: Fix the redirectTo**

In `frontend/js/auth.js`, change line 54 from:
```js
          redirectTo: window.location.href,
```
to:
```js
          redirectTo: `${window.location.origin}/login-callback.html`,
```

The full `requestDriveScope` function after the fix:
```js
    async requestDriveScope() {
      const { error } = await _client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file',
          redirectTo: `${window.location.origin}/login-callback.html`,
        },
      });
      if (error) console.error('[Auth] requestDriveScope error:', error.message);
    }
```

- [ ] **Step 2: Manual config — Supabase dashboard**

In the Supabase dashboard for project `kqinywnsotyssdciciuf`:
1. Go to Authentication → URL Configuration
2. Add the production Vercel URL to **Redirect URLs**: `https://dermai-livid.vercel.app/login-callback.html`
3. Save

- [ ] **Step 3: Manual config — Google Cloud Console**

In Google Cloud Console → APIs & Services → Credentials → the DermAI OAuth client:
1. Under **Authorized redirect URIs**, add: `https://dermai-livid.vercel.app/login-callback.html`
2. Save

- [ ] **Step 4: Commit**

```bash
git add frontend/js/auth.js
git commit -m "fix(auth): requestDriveScope redirectTo to use login-callback.html (BUG-001)"
```

---

## Task 2: Add `.in()` to Supabase mock chain

**Files:**
- Modify: `backend/test/helpers.js`

The compare route queries with `.in('id', [...])`. The existing `makeChain` helper doesn't include this method, so tests will throw.

- [ ] **Step 1: Update makeChain**

Replace the method list in `backend/test/helpers.js`:
```js
// Before
for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'gte', 'order', 'limit']) {
  c[m] = () => c;
}

// After
for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'gte', 'order', 'limit', 'in']) {
  c[m] = () => c;
}
```

Full updated file:
```js
function makeChain(result = { data: [], error: null }) {
  const c = {
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
    single: () => Promise.resolve(result),
  };
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'gte', 'order', 'limit', 'in']) {
    c[m] = () => c;
  }
  return c;
}

module.exports = { makeChain };
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
cd backend && npm test
```
Expected: all existing tests pass (no failures from the helper change).

- [ ] **Step 3: Commit**

```bash
git add backend/test/helpers.js
git commit -m "test: add .in() to Supabase mock chain"
```

---

## Task 3: Create backend/routes/compare.js with tests

**Files:**
- Create: `backend/routes/compare.js`
- Create: `backend/test/compare.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/test/compare.test.js`:
```js
const request = require('supertest');
const express = require('express');
const multer = require('multer');
const createCompareRouter = require('../routes/compare.js');
const { makeChain } = require('./helpers.js');

const mockGetSupabaseAdmin = vi.fn();
const mockGetClient = vi.fn();
const mockVerifyAuth = (req, res, next) => {
  req.user = { id: 'user-123' };
  req.supabaseToken = 'tok';
  next();
};
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(express.json());
app.use(createCompareRouter(mockVerifyAuth, mockGetSupabaseAdmin, mockGetClient, upload));

// Error handler so 500s don't crash the test process
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const fakeImg = Buffer.from('fake-image-data');

describe('POST /api/compare', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 when scan_a_id is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scan_a_id/);
  });

  it('400 when scan_b_id is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scan_b_id/);
  });

  it('400 when image_a is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image_a/);
  });

  it('400 when image_b is missing', async () => {
    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image_b/);
  });

  it('404 when only one scan belongs to user', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a' }], error: null })
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/access denied/i);
  });

  it('200 returns narrative when both scans belong to user', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a' }, { id: 'uuid-b' }], error: null })
    });
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Your skin has visibly improved.' } }]
          })
        }
      }
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('Your skin has visibly improved.');
  });

  it('429 when all OpenRouter models return rate limit error', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeChain({ data: [{ id: 'uuid-a' }, { id: 'uuid-b' }], error: null })
    });
    mockGetClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('429: rate limit exceeded'))
        }
      }
    });

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(429);
  });

  it('503 when database is not configured', async () => {
    mockGetSupabaseAdmin.mockReturnValue(null);

    const res = await request(app)
      .post('/api/compare')
      .field('scan_a_id', 'uuid-a')
      .field('scan_b_id', 'uuid-b')
      .attach('image_a', fakeImg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('image_b', fakeImg, { filename: 'b.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
cd backend && npm test -- compare
```
Expected: all 8 tests FAIL with "Cannot find module '../routes/compare.js'".

- [ ] **Step 3: Create backend/routes/compare.js**

```js
const express = require('express');

function createCompareRouter(verifyAuth, getSupabaseAdmin, getClient, upload) {
  const router = express.Router();

  router.post(
    '/api/compare',
    verifyAuth,
    upload.fields([{ name: 'image_a', maxCount: 1 }, { name: 'image_b', maxCount: 1 }]),
    async (req, res) => {
      const { scan_a_id, scan_b_id } = req.body;
      const files = req.files || {};

      if (!scan_a_id) return res.status(400).json({ error: 'scan_a_id is required' });
      if (!scan_b_id) return res.status(400).json({ error: 'scan_b_id is required' });
      if (!files.image_a?.[0]) return res.status(400).json({ error: 'image_a file is required' });
      if (!files.image_b?.[0]) return res.status(400).json({ error: 'image_b file is required' });

      const db = getSupabaseAdmin();
      if (!db) return res.status(503).json({ error: 'Database not configured' });

      const { data, error } = await db
        .from('scans')
        .select('id')
        .in('id', [scan_a_id, scan_b_id])
        .eq('user_id', req.user.id);

      if (error) return res.status(500).json({ error: error.message });
      if (!data || data.length < 2) {
        return res.status(404).json({ error: 'Scan not found or access denied' });
      }

      const client = getClient();
      if (!client) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set' });

      const fileA = files.image_a[0];
      const fileB = files.image_b[0];

      const prompt =
        'You are a dermatologist. Image 1 is an older skin scan; Image 2 is a more recent ' +
        'scan of the same patient. In 3–5 sentences, describe what has visibly changed — ' +
        'improvements, regressions, or no change. Be specific about concerns like acne, ' +
        'texture, tone, and pores. Write in plain English, directly to the patient.';

      const messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${fileA.mimetype};base64,${fileA.buffer.toString('base64')}` } },
          { type: 'image_url', image_url: { url: `data:${fileB.mimetype};base64,${fileB.buffer.toString('base64')}` } },
        ]
      }];

      const modelsToTry = [
        'qwen/qwen-2.5-vl-72b-instruct',
        'meta-llama/llama-3.2-11b-vision-instruct',
        'openai/gpt-4o-mini',
      ];

      let narrative = null;
      let lastError = null;
      let quotaHit = false;

      for (const model of modelsToTry) {
        try {
          console.log(`[compare] trying ${model}`);
          const completion = await client.chat.completions.create({
            model,
            messages,
            temperature: 0.3,
            max_tokens: 400,
          });
          narrative = completion.choices[0].message.content?.trim();
          console.log(`[compare] success: ${model}`);
          break;
        } catch (err) {
          const msg = String(err.message || err);
          if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
            quotaHit = true;
          }
          lastError = err;
        }
      }

      if (!narrative) {
        if (quotaHit) return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment and try again.' });
        throw lastError || new Error('All AI models failed');
      }

      res.json({ narrative });
    }
  );

  return router;
}

module.exports = createCompareRouter;
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
cd backend && npm test -- compare
```
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/compare.js backend/test/compare.test.js
git commit -m "feat(backend): POST /api/compare — vision diff endpoint with ownership check"
```

---

## Task 4: Register compare route in server.js

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Add the route registration**

In `backend/server.js`, after the `photos` route registration (line 82), add:
```js
app.use(require('./routes/compare')(verifyAuth, getSupabaseAdmin, getClient, upload));
```

The full routes block after the change:
```js
app.use(require('./routes/scans')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/favorites')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/routine')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/reactions')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/photos')(verifyAuth, getSupabaseAdmin));
app.use(require('./routes/compare')(verifyAuth, getSupabaseAdmin, getClient, upload));
```

- [ ] **Step 2: Run the full test suite**

```bash
cd backend && npm test
```
Expected: all tests pass (no regression from the new registration).

- [ ] **Step 3: Smoke-test the endpoint manually**

Start the server: `node backend/server.js`

```bash
curl -s http://localhost:3000/api/compare
```
Expected: `{"error":"Missing or invalid Authorization header"}` (401 from verifyAuth — confirms the route is registered and protected).

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): register /api/compare route in server.js"
```

---

## Task 5: Fix server scan merge — include image_urls

**Files:**
- Modify: `frontend/js/history.js:16`

The merge loop at line 16 drops `image_urls` from server scans. Without it, `compareScans` cannot read the Drive URL.

- [ ] **Step 1: Fix the merge**

In `frontend/js/history.js`, find this block inside `init()`:
```js
      for (const scan of serverScans) {
        const id = scan.id || new Date(scan.created_at).getTime();
        if (!localIds.has(String(id))) {
          historyData.push({ id, date: scan.created_at, analysis: scan.result_json });
        }
      }
```

Change to:
```js
      for (const scan of serverScans) {
        const id = scan.id || new Date(scan.created_at).getTime();
        if (!localIds.has(String(id))) {
          historyData.push({ id, date: scan.created_at, analysis: scan.result_json, image_urls: scan.image_urls || null });
        }
      }
```

- [ ] **Step 2: Verify the change manually**

Start the dev server and open `history.html` in the browser. Open DevTools console and type:
```js
// After page loads, inspect historyData (set a breakpoint or log it)
// Server scans should now have image_urls populated if Drive backup was enabled
```
No errors in console expected.

- [ ] **Step 3: Commit**

```bash
git add frontend/js/history.js
git commit -m "fix(history): include image_urls in server scan merge"
```

---

## Task 6: Add Compare button and panel to history cards

**Files:**
- Modify: `frontend/js/history.js` — `render()` function

- [ ] **Step 1: Update render() to track index and add Compare button**

In `frontend/js/history.js`, replace the `render()` function's inner loop. The current loop starts with `[...historyData].reverse().forEach(entry => {`. Replace the entire forEach block with the following (keep everything outside the forEach unchanged):

```js
    const reversed = [...historyData].reverse();
    reversed.forEach((entry, idx) => {
      const isLegacy = !entry.analysis;
      const score    = isLegacy ? entry.overallHealth    : entry.analysis.overallHealth;
      const skinType = isLegacy ? entry.skinType         : entry.analysis.skinType;
      const concerns = isLegacy ? (entry.concerns || []) : (entry.analysis.concerns || []);
      const entryId  = String(entry.id || entry.date);
      const dateObj  = new Date(entry.id || entry.date);
      const dayKey   = dateObj.toDateString();
      const entryMs  = entry.id || dateObj.getTime();

      let thumbSrc = null;
      const dayPhotos = photosByDay[dayKey] || [];
      if (dayPhotos.length > 0) {
        const closest = [...dayPhotos].sort(
          (a, b) => Math.abs(a.scanAt - entryMs) - Math.abs(b.scanAt - entryMs)
        )[0];
        thumbSrc = URL.createObjectURL(closest.blob);
      }

      const dateLabel = dateObj.toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      });

      const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';

      const concernsHTML = concerns.slice(0, 4).map(c => {
        const cls = c.severity > 60 ? 'hc-tag--high' : c.severity > 30 ? 'hc-tag--med' : 'hc-tag--low';
        return `<span class="hc-tag ${cls}">${c.name}</span>`;
      }).join('');

      // A card can be compared if it and its previous card both have a server UUID and a Drive photo
      const prevEntry = idx > 0 ? reversed[idx - 1] : null;
      const canCompare = (
        !isLegacy &&
        typeof entry.id === 'string' && entry.id.includes('-') &&
        Array.isArray(entry.image_urls) && entry.image_urls[0] &&
        prevEntry != null &&
        typeof prevEntry.id === 'string' && prevEntry.id.includes('-') &&
        Array.isArray(prevEntry.image_urls) && prevEntry.image_urls[0]
      );

      const card = document.createElement('div');
      card.className = 'history-card';

      card.innerHTML = `
        <div class="hc-thumb${thumbSrc ? '' : ' hc-thumb--empty'}">
          ${thumbSrc
            ? `<img src="${thumbSrc}" alt="Scan photo from ${dateLabel}" />`
            : '<span>NO<br>PHOTO</span>'}
        </div>
        <div class="hc-body">
          <div class="hc-meta">
            <span class="hc-date">${dateLabel}</span>
            <span class="hc-score" style="color:${scoreColor};border-color:${scoreColor};">${score}/100</span>
          </div>
          ${skinType ? `<div class="hc-skin-type">${skinType}</div>` : ''}
          ${concernsHTML ? `<div class="hc-concerns">${concernsHTML}</div>` : ''}
          ${isLegacy ? '<p class="hc-legacy">Limited data — re-scan to enable routine view</p>' : ''}
          <div class="hc-actions">
            ${!isLegacy
              ? `<button class="btn btn-primary btn-sm" data-action="view" data-id="${entryId}">VIEW ROUTINE</button>`
              : ''}
            ${canCompare
              ? `<button class="btn-ghost btn-sm" data-action="compare" data-id="${entryId}" data-prev-id="${String(prevEntry.id)}">Compare ↕</button>`
              : ''}
            <button class="btn-ghost btn-sm" data-action="del" data-id="${entryId}">DELETE</button>
          </div>
          <div class="hc-compare-panel" id="compare-${entryId}" hidden></div>
        </div>
      `;

      listEl.appendChild(card);
    });
```

- [ ] **Step 2: Add compare to the click handler**

In the `history-list` click listener, add the compare case:
```js
    document.getElementById('history-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'view')    viewRoutine(id);
      if (btn.dataset.action === 'del')     deleteEntry(id);
      if (btn.dataset.action === 'compare') compareScans(id, btn.dataset.prevId);
    });
```

- [ ] **Step 3: Verify in browser**

Open `history.html`. On any card that has a server UUID id and `image_urls` populated (from a scan taken after Drive backup was enabled), the "Compare ↕" button should appear next to the DELETE button. Clicking it should do nothing yet (compareScans not defined — console error is expected).

- [ ] **Step 4: Commit**

```bash
git add frontend/js/history.js
git commit -m "feat(history): add Compare button to history cards with index tracking"
```

---

## Task 7: Implement compareScans()

**Files:**
- Modify: `frontend/js/history.js` — add new function inside the IIFE

- [ ] **Step 1: Add compareScans() inside the IIFE, before `init()`**

Add the following function between `deleteEntry` and `window.clearAll`:

```js
  async function compareScans(entryId, prevEntryId) {
    const panel = document.getElementById('compare-' + entryId);
    if (!panel) return;

    // Toggle if already loaded
    if (panel.dataset.loaded === 'true') {
      panel.hidden = !panel.hidden;
      return;
    }

    panel.innerHTML = '<div class="hc-compare-loading"><span class="hc-spinner"></span> Comparing scans…</div>';
    panel.hidden = false;

    try {
      const googleToken = window.Auth ? await window.Auth.getProviderToken() : null;
      if (!googleToken) {
        panel.innerHTML = '<p class="hc-compare-error">Sign in with Google and enable Drive backup to use comparison.</p>';
        return;
      }

      const entry     = historyData.find(e => String(e.id) === String(entryId));
      const prevEntry = historyData.find(e => String(e.id) === String(prevEntryId));
      const urlOlder  = prevEntry?.image_urls?.[0];
      const urlNewer  = entry?.image_urls?.[0];

      if (!urlOlder || !urlNewer) {
        panel.innerHTML = '<p class="hc-compare-error">This scan doesn\'t have a saved photo. Enable Drive backup before scanning to use comparison.</p>';
        return;
      }

      async function fetchDriveBlob(webViewLink) {
        const match = /\/d\/([^/]+)/.exec(webViewLink);
        if (!match) throw Object.assign(new Error('Unrecognised Drive URL'), { type: 'parse' });
        const fileId = match[1];
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );
        if (res.status === 401 || res.status === 403) {
          throw Object.assign(new Error('Drive auth failed'), { type: 'auth' });
        }
        if (!res.ok) throw Object.assign(new Error(`Drive ${res.status}`), { type: 'fetch' });
        return res.blob();
      }

      let blobOlder, blobNewer;
      try {
        [blobOlder, blobNewer] = await Promise.all([
          fetchDriveBlob(urlOlder),
          fetchDriveBlob(urlNewer),
        ]);
      } catch (err) {
        if (err.type === 'auth') {
          panel.innerHTML = '<p class="hc-compare-error">Drive access expired. Re-enable Drive backup to refresh access.</p>';
        } else {
          panel.innerHTML = '<p class="hc-compare-error">Couldn\'t load photo from Drive. Try again.</p>';
        }
        return;
      }

      const objUrlOlder = URL.createObjectURL(blobOlder);
      const objUrlNewer = URL.createObjectURL(blobNewer);

      const supabaseToken = window.Auth ? await window.Auth.getToken() : null;
      if (!supabaseToken) {
        URL.revokeObjectURL(objUrlOlder);
        URL.revokeObjectURL(objUrlNewer);
        panel.innerHTML = '<p class="hc-compare-error">Sign in to use comparison.</p>';
        return;
      }

      const form = new FormData();
      form.append('scan_a_id', String(prevEntryId));  // older scan = image_a
      form.append('scan_b_id', String(entryId));       // newer scan = image_b
      form.append('image_a', blobOlder, 'scan_a.jpg');
      form.append('image_b', blobNewer, 'scan_b.jpg');

      const apiRes = await fetch('/api/compare', {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseToken}` },
        body: form,
      });

      if (!apiRes.ok) {
        URL.revokeObjectURL(objUrlOlder);
        URL.revokeObjectURL(objUrlNewer);
        if (apiRes.status === 404) {
          panel.innerHTML = '<p class="hc-compare-error">Scan not found.</p>';
        } else if (apiRes.status === 429) {
          panel.innerHTML = '<p class="hc-compare-error">AI rate limit reached. Wait a moment and try again.</p>';
        } else {
          panel.innerHTML = '<p class="hc-compare-error">Comparison failed. Try again.</p>';
        }
        return;
      }

      const { narrative } = await apiRes.json();

      panel.innerHTML = `
        <div class="hc-compare-photos">
          <img src="${objUrlOlder}" alt="Earlier scan" />
          <img src="${objUrlNewer}" alt="Recent scan" />
        </div>
        <p class="hc-compare-narrative">${narrative}</p>
        <button class="btn-ghost btn-sm hc-compare-close">Close</button>
      `;
      panel.dataset.loaded = 'true';

      panel.querySelector('.hc-compare-close').addEventListener('click', () => {
        panel.hidden = true;
      });

      window.addEventListener('beforeunload', () => {
        URL.revokeObjectURL(objUrlOlder);
        URL.revokeObjectURL(objUrlNewer);
      }, { once: true });

    } catch (err) {
      console.error('[compareScans]', err);
      panel.innerHTML = '<p class="hc-compare-error">Comparison failed. Try again.</p>';
    }
  }
```

- [ ] **Step 2: Verify in browser — happy path**

Prerequisites:
- Server running locally
- Signed in with Google + Drive backup enabled
- At least 2 scans in history, both with Drive photos (image_urls populated)

Steps:
1. Open `history.html`
2. Find a card with a "Compare ↕" button
3. Click it
4. Expected: panel expands, shows "Comparing scans…" spinner, then two photos side by side with a narrative paragraph and a "Close" button
5. Click "Close" — panel collapses
6. Click "Compare ↕" again — panel re-expands instantly (cached, no second API call)

- [ ] **Step 3: Verify in browser — error path**

Test with a scan that has no Drive photo:
1. Temporarily set `entry.image_urls = null` in DevTools console
2. Click "Compare ↕"
3. Expected: error message "This scan doesn't have a saved photo..."

- [ ] **Step 4: Commit**

```bash
git add frontend/js/history.js
git commit -m "feat(history): implement compareScans() — Drive fetch + vision diff + inline panel"
```

---

## Task 8: Add CSS for compare panel

**Files:**
- Modify: `frontend/css/history.css`

- [ ] **Step 1: Append the three new rule blocks**

Add to the end of `frontend/css/history.css`:

```css
/* ── Compare panel ─────────────────────────────────────────── */

.hc-compare-panel {
  padding: 12px 0 4px;
  border-top: 1px solid var(--border, #e5e7eb);
  margin-top: 8px;
}

.hc-compare-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-muted, #6b7280);
}

.hc-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border, #e5e7eb);
  border-top-color: var(--primary, #7c3aed);
  border-radius: 50%;
  animation: hc-spin 0.7s linear infinite;
}

@keyframes hc-spin {
  to { transform: rotate(360deg); }
}

.hc-compare-error {
  font-size: 0.82rem;
  color: var(--text-muted, #6b7280);
  margin: 0;
}

.hc-compare-photos {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.hc-compare-photos img {
  width: 50%;
  border-radius: 8px;
  object-fit: cover;
  aspect-ratio: 1;
}

.hc-compare-narrative {
  font-size: 0.85rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
  margin: 0 0 8px;
}
```

- [ ] **Step 2: Verify visually in browser**

1. Open `history.html` and trigger a compare
2. Loading state: spinner animation plays and "Comparing scans…" text appears
3. Success state: two square photos side by side, narrative text below, Close button present
4. Error state: muted error text, no broken layout

- [ ] **Step 3: Run full backend test suite one last time**

```bash
cd backend && npm test
```
Expected: all tests pass.

- [ ] **Step 4: Final commit**

```bash
git add frontend/css/history.css
git commit -m "feat(history): add CSS for compare panel — photos, narrative, spinner, error"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] BUG-001 OAuth fix → Task 1
- [x] `requestDriveScope redirectTo` fix → Task 1, Step 1
- [x] `helpers.js .in()` → Task 2
- [x] `POST /api/compare` backend route → Task 3
- [x] Route registered in server.js → Task 4
- [x] image_urls merge fix → Task 5
- [x] Compare button on history cards → Task 6
- [x] compareScans() function → Task 7
- [x] Drive image fetch with Google token → Task 7, Step 1
- [x] Side-by-side photos + narrative panel → Task 7, Step 1
- [x] All error states inline → Task 7, Step 1
- [x] Toggle re-click (collapse/expand) → Task 7, Step 1
- [x] Object URL cleanup on close + unload → Task 7, Step 1
- [x] CSS → Task 8
- [x] scan_a_id = older scan, scan_b_id = newer scan (prompt order) → Task 3, Step 3; Task 7, Step 1

**No placeholders:** All steps contain full code. No TBDs.

**Type consistency:**
- `compareScans(entryId, prevEntryId)` — defined Task 7, called Task 6 ✅
- `createCompareRouter(verifyAuth, getSupabaseAdmin, getClient, upload)` — defined Task 3, registered Task 4 ✅
- `makeChain` `.in()` — added Task 2, used in Task 3 tests ✅
- `panel.dataset.loaded` — set Task 7 render, checked Task 7 toggle ✅
- `.hc-compare-panel`, `.hc-compare-photos`, `.hc-compare-narrative`, `.hc-spinner`, `.hc-compare-loading`, `.hc-compare-error` — all used in Task 7, all defined in Task 8 ✅
