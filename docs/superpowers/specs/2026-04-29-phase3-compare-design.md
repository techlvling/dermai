# Phase 3 — AI Skin Comparison Design Spec

**Date:** 2026-04-29
**Branch:** master
**Status:** Approved, ready for implementation

---

## Prerequisites (fix before implementing Phase 3)

### BUG-001 — OAuth implicit flow / localhost redirect (security)

**Symptom:** After Google sign-in, browser lands on
`localhost:3000/#access_token=<JWT>&provider_token=<google-token>&...`
instead of the production Vercel URL. Tokens are visible in the browser
address bar and history.

**Root cause:** `signInWithGoogle()` passes `redirectTo: window.location.href`,
which resolves to `http://localhost:3000` during local dev. Supabase falls back
to implicit flow (tokens in `#` hash) instead of PKCE flow (code in `?code=`
query param → `login-callback.html` → `exchangeCodeForSession()`).

**Fix required:**

1. `frontend/js/auth.js` — change `redirectTo` in `signInWithGoogle()`:
   ```js
   redirectTo: `${window.location.origin}/login-callback.html`
   // NOT: redirectTo: window.location.href
   ```
2. Supabase Auth dashboard → URL Configuration → add production Vercel URL
   to the Redirect URLs allowlist.
3. Google Cloud Console → OAuth client → Authorized redirect URIs → add
   `https://<vercel-url>/login-callback.html`.
4. Verify Supabase JS SDK client init uses PKCE flow (default for v2):
   check `flowType` in `frontend/js/auth.js` client initialisation.

**Why this blocks Phase 3:** `compareScans()` calls
`window.Auth.getProviderToken()` to fetch Drive images. If the token is
captured from an implicit-flow hash redirect, it may be stale, missing, or
insecure. Fix this first.

---

## Overview

Add AI-powered skin comparison to the history page. Users click **"Compare ↕"**
on a history card to compare that scan with the one directly before it. The
backend fetches both Drive photos, sends them to an OpenRouter vision model,
and returns a dermatologist-style narrative of what changed. The result renders
as a side-by-side photo panel that expands inline under the card.

---

## Decisions

| Question | Answer |
|---|---|
| Trigger | "Compare ↕" button on each history card (compares with previous scan chronologically) |
| Diff source | Vision diff — Drive thumbnails → OpenRouter vision model |
| Output location | Inline panel expanding under the history card |
| Output format | Side-by-side photos + AI narrative paragraph |
| No-photo fallback | Error message with guidance to enable Drive backup |
| Auth | Require login — server verifies scan ownership |
| Cost | Free / absorb, no rate limit or caching for now |

---

## Architecture

```
history.html
  └─ "Compare ↕" click
       ├─ extract fileId from webViewLink (regex: /\/d\/([^/]+)/)
       ├─ fetch image bytes via Drive API
       │    GET /drive/v3/files/<id>?alt=media
       │    Authorization: Bearer window.Auth.getProviderToken()
       ├─ create object URLs for display
       ├─ POST FormData { scan_a_id, scan_b_id, image_a, image_b }
       │    Authorization: Bearer <Supabase JWT>
       │
       POST /api/compare  (backend/routes/compare.js)
         ├─ verifyAuth middleware  →  req.user.id
         ├─ multer.fields([image_a, image_b])
         ├─ Supabase: SELECT WHERE id IN (a,b) AND user_id = req.user.id
         │    → 404 if < 2 rows returned
         ├─ OpenRouter vision call (getClient() + model fallback chain)
         │    prompt: dermatologist comparison narrative, 3–5 sentences
         └─ res.json({ narrative })
       │
       Panel renders:
         [img object URL A]  [img object URL B]
         [narrative paragraph]
         [revoke object URLs on close / unload]
```

Google token never touches the server. Backend only handles the Supabase JWT
it already verifies via `verifyAuth`.

---

## Backend

### New file: `backend/routes/compare.js`

Factory pattern matching existing routes:

```
createCompareRouter(verifyAuth, getSupabaseAdmin, getClient, upload)
```

`getClient` is the OpenRouter client factory already defined in `server.js` —
it must be passed in because `compare.js` cannot import it directly (it's not
exported). The function signature adds `getClient` as the third param, before
`upload`.

**Endpoint:** `POST /api/compare`

**Middleware:** `verifyAuth` → `upload.fields([{ name:'image_a', max:1 }, { name:'image_b', max:1 }])`

**Validation:**
- `req.body.scan_a_id` and `req.body.scan_b_id` must be present
- `req.files.image_a` and `req.files.image_b` must be present

**Supabase ownership check:**
```js
SELECT id FROM scans
WHERE id IN (scan_a_id, scan_b_id) AND user_id = req.user.id
```
Return 404 `{ error: 'Scan not found or access denied' }` if fewer than
2 rows come back.

**OpenRouter call:**
- Uses existing `getClient()` factory from `server.js` (passed in)
- Same model fallback chain:
  1. `qwen/qwen-2.5-vl-72b-instruct`
  2. `meta-llama/llama-3.2-11b-vision-instruct`
  3. `openai/gpt-4o-mini`
- Both images sent as `data:<mime>;base64,...` image_url content items
- Prompt:
  > "You are a dermatologist. Image 1 is an older skin scan; Image 2 is a
  > more recent scan of the same patient. In 3–5 sentences, describe what
  > has visibly changed — improvements, regressions, or no change. Be
  > specific about concerns like acne, texture, tone, and pores. Write in
  > plain English, directly to the patient."
- `temperature: 0.3`, `max_tokens: 400`

**Response:** `{ narrative: string }`

### Change to `backend/server.js`

Add one line in the routes block (after `photos` route):
```js
app.use(require('./routes/compare')(verifyAuth, getSupabaseAdmin, getClient, upload));
```

`upload` (the existing multer instance) and `getClient` are passed in —
`compare.js` does not re-instantiate either.

---

## Frontend

### Changes to `frontend/js/history.js`

**0. Server scan merge fix (prerequisite for compare)**

In `init()`, the server scan merge currently drops `image_urls`:
```js
// current (broken for compare)
historyData.push({ id, date: scan.created_at, analysis: scan.result_json });

// fix: include image_urls
historyData.push({ id, date: scan.created_at, analysis: scan.result_json, image_urls: scan.image_urls });
```
Without this, `compareScans` cannot read the Drive URLs from scan entries.

**1. `render()` loop**

Change `[...historyData].reverse().forEach(entry => ...)` to track index.
History is sorted newest-first; after reversing, index 0 is the oldest.
A "Compare ↕" button appears on every card **except the oldest** (index 0
after reverse, i.e. `historyData.length - 1` before reverse), and only
when **both** the current entry and its previous entry have a server-side
UUID `id` and a non-empty `image_urls[0]`.

Button markup added inside `.hc-actions`:
```html
<button class="btn-ghost btn-sm" data-action="compare"
        data-id="${entryId}" data-prev-id="${prevEntryId}">
  Compare ↕
</button>
```

Also append the compare panel div inside `.hc-body`:
```html
<div class="hc-compare-panel" id="compare-${entryId}" hidden></div>
```

**2. Click handler**

Add to existing `data-action` switch in the `history-list` click listener:
```js
if (btn.dataset.action === 'compare')
  compareScans(btn.dataset.id, btn.dataset.prevId, btn);
```

**3. New function `compareScans(idA, idB, btn)`**

```
1. Find panel: document.getElementById('compare-' + idA)
2. If panel is already populated → toggle hidden, return  (re-click collapses)
3. Show loading state: panel.innerHTML = spinner + "Comparing scans…", un-hide
4. Get Google token: window.Auth.getProviderToken()
   → null: render error "Sign in with Google and enable Drive backup to use comparison."
5. Find both scan entries in historyData by id
   → get image_urls[0] from each
   → missing on either: render error (see Error Handling)
6. Extract fileId: /\/d\/([^/]+)/.exec(imageUrl)?.[1]
   → null: render error "Couldn't load photo from Drive."
7. Fetch both image blobs:
     fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
           { headers: { Authorization: `Bearer ${googleToken}` } })
   → 401/403: render error "Drive access expired. Re-enable Drive backup to refresh access."
   → other error: render error "Couldn't load photo from Drive. Try again."
8. Create object URLs from blobs (store refs for cleanup)
9. Build FormData: scan_a_id, scan_b_id, image_a (blob), image_b (blob)
10. POST to /api/compare with Supabase JWT (window.Auth.getToken())
    → 404: render error "Scan not found."
    → 429: render error "AI rate limit reached. Wait a moment and try again."
    → other: render error "Comparison failed. Try again."
11. Render success panel (see Panel HTML below)
12. Register cleanup: revoke both object URLs on panel close or page unload
```

**Panel HTML (success state):**
```html
<div class="hc-compare-photos">
  <img src="${objectUrlA}" alt="Earlier scan" />
  <img src="${objectUrlB}" alt="Recent scan" />
</div>
<p class="hc-compare-narrative">${narrative}</p>
<button class="btn-ghost btn-sm hc-compare-close">Close</button>
```

### Changes to `frontend/css/history.css`

Three new rule blocks:

```css
.hc-compare-panel {
  padding: 12px 0 4px;
  border-top: 1px solid var(--border, #e5e7eb);
  margin-top: 8px;
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

---

## Error Handling

All errors render inline in the compare panel. No alerts. No silent failures.

| Scenario | Panel message |
|---|---|
| Scan missing `image_urls` | "This scan doesn't have a saved photo. Enable Drive backup before scanning to use comparison." |
| `getProviderToken()` null | "Sign in with Google and enable Drive backup to use comparison." |
| Drive 401 / 403 | "Drive access expired. Re-enable Drive backup to refresh access." |
| Drive other error | "Couldn't load photo from Drive. Try again." |
| `/api/compare` 404 | "Scan not found." |
| `/api/compare` 429 | "AI rate limit reached. Wait a moment and try again." |
| `/api/compare` 500 / network | "Comparison failed. Try again." |

Loading state: spinner + "Comparing scans…" for the full async operation
(Drive fetch + API call).

---

## Files Changed

| File | Change |
|---|---|
| `backend/routes/compare.js` | New file |
| `backend/server.js` | One new `app.use()` line |
| `frontend/js/history.js` | render() index tracking, compare button, compareScans() function |
| `frontend/css/history.css` | Three new rule blocks |

No database migrations required. No new environment variables.

---

## Out of Scope (Phase 4 candidates)

- Result caching in Supabase (`scan_comparisons` table)
- Rate limiting per user
- Comparing any two arbitrary scans (not just adjacent)
- Text diff fallback when Drive photos are missing
