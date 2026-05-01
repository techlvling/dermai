# tinkskin — Open TODOs

---

## TODO 1: Wire hero stat tiles to real API counts

**What:** Replace hardcoded stat values in `index.html` with real counts fetched from
`/api/ingredients` and `/api/concerns` at page load.

**Why:** Hardcoded numbers that don't match the actual database erode trust if a user checks.
"47 RCTs Analyzed" when the database has fewer ingredients is a credibility risk.

**How:**
- In `animations.js` or a new script, fetch `/api/ingredients` and count entries.
- Count total `keyStudies` across all ingredients for the RCT count.
- Update `data-count` attribute and text content of the stat tiles before count-up fires.
- Fallback: keep current hardcoded values if API fails.

**Effort:** ~45 min. Requires backend to be running when homepage loads (already the case in prod).

**Depends on:** Backend server running at time of page load.

---

## TODO 2: SW cache versioning automation

**What:** The Phase 4 PWA service worker uses a `__GIT_HASH__` placeholder replaced by
`backend/scripts/inject-version.js` at build time. Consider adding a safeguard so a manual
deploy without the build step doesn't ship a broken service worker.

**Why:** If someone pushes directly without the Vercel `buildCommand` running, `sw.js` will
contain the literal string `__GIT_HASH__` and the service worker will fail to install silently.

**How:**
- Verify `vercel.json` has `buildCommand` set so the inject always runs on Vercel deploys.
- Optionally add a startup check in `server.js` that warns if `sw.js` still contains `__GIT_HASH__`.

**Effort:** ~20 min.

**Depends on:** Phase 4 E4 (PWA) shipped.

---

## TODO 3: Push notification permission prompt (Phase 5)

**What:** The Phase 4 PWA registers a service worker but does not request push permission.
Phase 5 should add a timed push prompt (after 3rd scan) for scan reminders and milestone
notifications.

**Why:** Push is the highest-ROI retention channel after email. Deferred because it requires
push server infrastructure and careful UX timing — asking too early is the #1 reason users
deny push permanently.

**How:**
- Add `Notification.requestPermission()` gated on a scan count threshold.
- Set up a push server (Web Push Protocol) or use a managed service (OneSignal, etc.).
- Add push subscription storage to Supabase (`push_subscriptions` table).

**Effort:** ~2 days human / ~1 hour CC.

**Depends on:** Phase 4 E4 (PWA) shipped; user base with 3+ scans exists to justify the ask.
