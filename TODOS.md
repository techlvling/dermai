# DermAI — Design TODOs

From `/plan-design-review` on 2026-04-25.

---

## TODO 1: Scroll-spy active nav state

**What:** Add IntersectionObserver-based scroll-spy to `animations.js` that highlights the current
section's nav link (How It Works / Features / FAQ) as the user scrolls.

**Why:** The navbar is now sticky (added in this review) but has no active-state feedback. Users
can't tell which section they're in without looking at section headings. On an 8-section page,
wayfinding matters.

**How:**
- In `animations.js`, observe each section with an anchor id (`#how-it-works`, `#features`, `#faq`).
- When a section enters the viewport, find the matching `.nav-links a[href="#id"]` and add an active class.
- CSS: `.nav-links a.active { color: var(--primary-600); border-bottom: 2px solid var(--primary-400); }`

**Effort:** ~30 min. No external dependencies.

**Depends on:** Sticky navbar (already shipped).

---

## TODO 2: Wire hero stat tiles to real API counts

**What:** Replace hardcoded stat values (47 RCTs, 12 Ingredients) in `index.html` with real counts
fetched from `/api/ingredients` and `/api/concerns` at page load.

**Why:** Hardcoded numbers that don't match the actual database erode trust if a user checks.
"47 RCTs Analyzed" when the database has fewer ingredients is a credibility risk.

**How:**
- In `animations.js` or a new script, fetch `/api/ingredients` and count entries.
- Count total `keyStudies` across all ingredients for the RCT count.
- Update `data-count` attribute and text content of the stat tiles before count-up fires.
- Fallback: keep current hardcoded values if API fails.

**Effort:** ~45 min. Requires backend to be running when homepage loads (already the case in prod).

**Depends on:** Backend server running at time of page load.
