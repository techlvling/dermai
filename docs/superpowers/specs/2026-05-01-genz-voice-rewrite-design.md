# GenZ/GenX Voice Rewrite — UI Copy Refresh

## Context

The DermAI dashboard reads like every other corporate health app: "Your Personalized Routine", "Take Today's Scan", "We need to analyze your skin first!". It's polite, generic, and does nothing to differentiate from the dozen other AI-skincare clones on the market. The user (founder) wants the product to sound like *them* — chronically online, profane, direct, meme-aware. The same way they'd talk to a friend in DMs about their face.

This is **copy-only**. No visual changes, no new components, no schema changes, no new features. Every customer-facing string in the UI gets rewritten in a single voice. Clinical content (PMID-cited evidence panels, Rx callouts, ingredient names, privacy policy) stays in plain English so the trust signal where it matters is preserved.

## Decided scope (confirmed via brainstorming)

**Profanity dial:** Medium. F-bombs in hero CTAs and emotional reactions; milder words (shit / damn / wtf / hell) sprinkled across body copy. Never on clinical surfaces.

**Voice flavor:** Hybrid chronically-online — meme references like "lock in", "this is fine", "ate that", "we move", "no thoughts head empty" — without going full TikTok-shibboleth. Lands with anyone under 50 who's been on the internet. Occasional emoji for emphasis, not constant.

**In-scope surfaces (full voice):**
- Landing page (`index.html`)
- Analyze page (`analyze.html`) — hero + upload prompts + loading messages + error states
- Dashboard sidebar nav labels
- Overview welcome + stat card labels + "Recent Scans" + trends panel header
- Treatment page — title/sub, filter chips, category headers, "I have this" toggle, empty states
- Routine page — header, "Take Today's Scan" hero, "Quick Check-in" button, no-analysis warning, stale-scan banner, badges, step labels, MARK DONE button, empty-slot CTAs, notification widget labels, AM/PM block headers
- Lifestyle modal — title, field labels, scale labels, action buttons
- History page — title, empty state, Compare link, bulk action buttons
- Ingredients page — title, search placeholder
- Connections page — title + Drive card status labels
- Modals — reaction modal, reorder modal headings + actions
- Toasts + sync-pending banners + reorder banners
- Browser push notification body strings
- Concern descriptions in `data/concerns.json` (the `description` field, NOT clinical metadata like `targetIngredients` or `rationale`)

**Out of scope (stays clean):**
- WHY THIS evidence panels with PMID citations (in `recommendations.js` / `treatment.js` `_buildEvidenceHTML`)
- Rx "consult derm" warnings (`prod.consultDermNote`)
- Ingredient names + concern names (medical terms — "Acne", "Tretinoin" stay proper)
- Privacy policy + footer + legal disclaimers ("Cosmetic analysis only — not a substitute for professional medical advice." stays clinical)
- Backend error messages (dev-facing, not user-facing)
- The freshness pill text ("RCT-tested", "Claims-studied", "Ingredient-only", "Refreshed today" — these are honest evidence labels)

## Voice rules — the "do" / "don't" cheat sheet

**Do:**
- Lowercase by default ("scan ur shit", not "Scan Your Shit")
- Punchy verbs ("yeet", "lock in", "cook", "bet", "fix", "log it")
- Direct subject — never "we'd love to help you with..."
- Profanity for emphasis at high-emotion moments (scan complete, error, empty state)
- Meme-aware references ("this is fine 🔥", "no thoughts head empty", "ate that", "we move", "the audacity")
- Second-person ("ur skin", "u haven't scanned")
- Contractions everywhere ("can't", "won't", "ur", "tho")

**Don't:**
- Never apologize politely ("We're sorry, but..." → "shit broke")
- Never use marketing-speak ("seamlessly", "leverage", "unlock", "elevate", "journey")
- Never use exclamation points unless ironic
- Never use profanity inside clinical evidence text
- Never use slurs of any kind, ever, even ironically
- Never sound like ChatGPT ("Certainly!", "Here's a breakdown...")

## Surface inventory — before / after

### Landing (`index.html`)
| Surface | Before | After |
|---|---|---|
| Tagline | Clinical-grade skin analysis powered by AI | AI roasts ur skin so derms don't have to |
| Hero CTA | Analyze My Skin | scan ur face fr |
| Sub-CTA | Track your progress with daily photos | log it daily, watch ur face level up |

### Analyze (`analyze.html` + `upload.js`)
| Surface | Before | After |
|---|---|---|
| Page title | Analyze | scan in |
| Hero | AI Skin Analysis | let's see what we're working with |
| Upload prompt | Take or upload 1-3 photos of your face | drop 1-3 face pics (front + sides if u feel like it) |
| Analyze button | Analyze Photos | cook ☕ |
| Loading rotation | "Analyzing your skin..." / "Looking at your concerns..." / "Building your routine..." | "AI is cooking..." / "reading ur face like a tarot deck..." / "calculating the damage..." |
| Sign-in soft gate | Sign in to save this analysis across devices | log in or u lose this when u close the tab |
| Generic error | Something went wrong. Please try again. | shit broke. try again. |
| Rate limit error | AI rate limit reached. Please wait a moment. | AI is cooked rn. wait a sec. |
| No image error | Image not received — please try again. | didn't get the pic. try again. |

### Dashboard sidebar (`dashboard.html`)
Nav labels stay short — they're navigation, not personality slots:
- Overview → **home**
- Treatment → **shop** *(or keep "Treatment" — discuss)*
- Routine → **routine** *(no change)*
- History → **history** *(no change)*
- Ingredients → **science** *(or keep "Ingredients")*
- Connections → **plug-ins**

*Tradeoff: short labels are easier to scan; renaming Treatment → "shop" or Ingredients → "science" risks confusing returning users. Recommendation: keep nav labels mostly stock, only rename Connections → "plug-ins" since "Connections" is corporate-vague.*

### Overview (`dashboard.html` + `dashboard.js`)
| Surface | Before | After |
|---|---|---|
| Welcome H1 | Your Skin Dashboard | wsp 👋 |
| Welcome sub | Track progress, browse ingredients, and manage your routine. | here's how ur face is doing |
| Stat: Total Scans | Total Scans | scans logged |
| Stat: Day Streak | Day Streak | streak (don't break it) |
| Stat: Latest Score | Latest Score | last score |
| Stat: Wellness Today | Wellness Today | vibe today |
| Recent Scans header | Recent Scans | recent scans |
| View all link | View all → | all of em → |
| Empty (no scans) | No scans yet — Take your first AI skin analysis to start tracking your progress. | no scans yet. go scan ur face fr |
| Trends panel H2 | Your trends | how u been |
| Correlation eyebrow | PATTERN SPOTTED | bro look at this |
| Correlation example body | On days you slept under 6 hours, your skin scored 12 points lower (across 8 observed days). | on days u slept <6h, ur skin was 12 pts worse (8 days observed). sleep matters fr. |

### Treatment (`treatment.js`)
| Surface | Before | After |
|---|---|---|
| Page H1 | Your Treatment | shit to put on ur face |
| Sub | Clinically-backed products tailored to your scan. Click I have this on anything you own | products that actually work for ur face. tap "got this" if u own it |
| Filter: Recommended for you | Recommended for you | for u |
| Filter: Full catalog | Full catalog | everything |
| Filter: My routine | My routine | what i own |
| Category: Cleansers | Cleansers | wash ur face |
| Category: Treatments | Treatments (active ingredients) | the actives (where the magic happens) |
| Category: Moisturizers | Moisturizers | moisturizers |
| Category: Sunscreens | Sunscreens | spf (non-negotiable) |
| Toggle off | + I have this | + got this one |
| Toggle on | ✓ In your routine — Remove | ✓ in routine — yeet it |
| Buy link | Search on Amazon → | find on amazon → |
| No-analysis empty | Scan first to see recommendations — Take a 3-photo skin scan and we'll show products matched to your concerns. | scan first bestie. we can't recommend shit if we haven't seen ur face |
| Owned-empty | You haven't added anything to your routine yet. Switch to Recommended for you and click I have this on what you own. | nothing here. tap "got this" on stuff u actually own from the recommended tab |

### Routine (`recommendations.js` + `dashboard.html`)
| Surface | Before | After |
|---|---|---|
| H1 | Your Personalized Routine | ur routine |
| Sub | Based on your AI skin analysis, here are clinically proven products tailored to your skin concerns. | what to do, when. (only stuff u own) |
| Hero scan button | Take Today's Scan | scan in 📷 |
| Scanned-today state | Scanned today ✓ — Re-scan | scanned today ✓ — re-scan |
| Quick Check-in | Quick Check-in | log today's vibes |
| No-analysis warning H2 | We need to analyze your skin first! | u haven't scanned yet bestie |
| No-analysis body | Please go back and upload a photo so we can recommend the right ingredients for you. | we can't read minds. go scan ur face. |
| No-analysis CTA | Analyze My Skin | scan ur shit |
| History link | Already scanned before? View your scan history → | already scanned? check ur history → |
| Stale banner | Your skin analysis is N days old. Results may no longer reflect your current skin. | this scan is N days old. ur face has had a whole arc since then. |
| Stale CTA | Re-analyze | re-scan |
| Sync-pending banner | This scan hasn't synced to your account yet. Retry sync | this scan didn't sync. retry |
| AM block | ☀️ Morning Routine | ☀️ morning |
| PM block | 🌙 Evening Routine | 🌙 night |
| Step label: Cleanser | Step 1: Cleanser | step 1 — wash |
| Step label: Treatment | Step 2: Treatment | step 2 — actives |
| Step label: Moisturizer | Step 3: Moisturizer | step 3 — moisturize |
| Step label: Sunscreen | Step 4: Sunscreen | step 4 — spf |
| Empty slot CTA | Nothing in this slot yet. — Browse cleansers in Treatment | this slot's empty. go yeet a cleanser in there → |
| MARK DONE | MARK DONE | did it |
| DONE | DONE | ate ✓ |
| Patch test banner | 48h patch test complete for X — any reaction? | 48h patch test on X — face still alive? |
| Reorder banner | Running low: X (~Nd) — Reorder → | almost out of X (~Nd) — restock → |
| Skin Profile H3 | Your Skin Profile | ur deal |
| Skin Type | Skin Type | type |
| Targeting | Targeting | fixing |
| Print Routine | Print Routine | print this shit |
| Share Card | Share Card | flex card |
| Notif: ROUTINE REMINDERS | ROUTINE REMINDERS | routine reminders |
| Notif: DAILY SCAN REMINDER | DAILY SCAN REMINDER | daily scan ping |
| Stats headline label | OVERALL ADHERENCE · LAST N DAYS | how locked in u are · last N days |
| Badges: FIRST SCAN | FIRST SCAN | first scan ✓ |
| Badges: 3 DAY STREAK | 3 DAY STREAK | 3 days locked in |
| Badges: WEEK STREAK | WEEK STREAK | week locked in |
| Badges: 30 DAY STREAK | 30 DAY STREAK | 30 days. sigma. |
| Badges: 5 FAVORITES | 5 FAVORITES | 5 saved (consumer mode) |
| Reaction button | LOG REACTION | report a reaction |
| REACTION LOGGED | REACTION LOGGED | flagged |

### Lifestyle modal (`lifestyle-modal.js`)
| Surface | Before | After |
|---|---|---|
| Title | Today's check-in | how's today |
| WATER label | WATER (LITERS) | h2o |
| Water goal | of 2.5 L goal | of 2.5L goal |
| SLEEP label | SLEEP (HRS) | sleep hrs |
| STRESS label | STRESS (1–5) | stress |
| Stress scale low | 1 = CALM | 1 = chillin |
| Stress scale high | 5 = OVERWHELMED | 5 = losing it |
| SUN label | SUN (MIN OUTSIDE) | sun (min outside) |
| Sun goal | 15–60 min ideal | 15–60 min is the sweet spot |
| ALCOHOL label | ALCOHOL (DRINKS) | drinks today |
| SYMPTOMS label | SYMPTOMS (TAP ANY) | anything weird? (tap any) |
| Symptom: Acne flare | Acne flare | acne flare |
| Symptom: Dryness | Dryness | dry asf |
| Symptom: Redness | Redness | red |
| Symptom: Irritation | Irritation | irritated |
| Symptom: Breakout | Breakout | breakout |
| Same as yesterday | Same as yesterday | same as yesterday lol |
| No yesterday data | No yesterday data | no data yet |
| Skip for today | Skip for today | nah skip |
| Save check-in | Save check-in | log it |

### History (`history.js` + `dashboard.html`)
| Surface | Before | After |
|---|---|---|
| H1 | Scan History | scan history |
| Compare link | Compare two scans → | compare two scans (see if ur cooking) → |
| Empty state | No scans recorded yet. — Analyze Now | no scans yet. — scan ur face |
| Export | Export JSON | export raw data |
| Clear All History | Clear All History | nuke all scans |
| Compare H1 | Compare Scans | compare two scans |
| Compare empty | You need at least 2 scans to compare. | need at least 2 scans first |
| Compare run button | Compare → | compare → |

### Ingredients (`dashboard.html`)
| Surface | Before | After |
|---|---|---|
| H1 | Clinical Ingredient Encyclopedia | what's in this stuff |
| Sub | Explore the active ingredients backed by gold-standard PubMed clinical trials. | every active ingredient + the receipts (PubMed PMIDs). |
| Search placeholder | Search ingredients (e.g., Salicylic Acid)... | search (e.g. salicylic acid)... |

### Connections (`dashboard.html` + `dashboard.js`)
| Surface | Before | After |
|---|---|---|
| H1 | Connections | plug-ins |
| Sub | Manage how DermAI talks to your other accounts. | hook DermAI up to ur other apps |
| Drive: Connect | Connect Google Drive | hook up google drive |
| Drive: Connected | Connected | hooked up ✓ |
| Drive: Not connected | Not connected | not hooked up |
| Drive: Open folder | Open my Drive folder | open my drive folder |
| Drive: Test | Test Drive connection | test if it works |
| Drive: Forget | Forget | yeet |

### Browser push notifications (`notifications.js`)
| Before | After |
|---|---|
| Time for your morning skincare routine! | yo, morning routine. lock in. |
| Evening routine reminder — your skin will thank you. | night routine ping. ur face will thank u. |
| Time for today's skin scan + check-in. | scan time. cook ☕ |

### Concern descriptions (`data/concerns.json`)
The `description` field for each concern stays clinically accurate but loses the formal tone. Keep medical terminology where it's load-bearing.
| Concern | Before description | After description |
|---|---|---|
| Acne | Inflammatory and non-inflammatory lesions caused by excess sebum, clogged pores, and bacterial activity. | clogged pores + bacteria = bumps. classic acne. |
| Hyperpigmentation | Darker patches caused by excess melanin from sun exposure, hormones, or post-inflammatory healing. | dark patches from sun, hormones, or old breakouts healing weird. |
| Fine lines | Early signs of aging from collagen breakdown, sun damage, and reduced cell turnover. | early aging signs. collagen's slowing down. |

(Note: I'll inventory `concerns.json` at execution time and rewrite each. Keep `targetIngredients` and `rationale` fields untouched — those drive the WHY THIS evidence panels.)

## Critical files reference

| Layer | Files |
|---|---|
| Static HTML | `frontend/index.html`, `frontend/analyze.html`, `frontend/dashboard.html` |
| JS | `frontend/js/upload.js`, `frontend/js/recommendations.js`, `frontend/js/treatment.js`, `frontend/js/lifestyle-modal.js`, `frontend/js/overview-trends.js`, `frontend/js/dashboard.js`, `frontend/js/history.js`, `frontend/js/notifications.js` |
| Data | `backend/data/concerns.json` (description fields only) |
| Out of scope | `frontend/privacy.html`, footer copy in dashboard.html, anything inside `_buildEvidenceHTML` / `consultDermNote` / freshness pill / trial badge |

## Ship order

1. **Inventory pass** — read each in-scope file, list every customer-facing string. Cross-check against the surface inventory above.
2. **Static HTML** — rewrite `index.html`, `analyze.html`, `dashboard.html` strings in one commit.
3. **JS modules** — rewrite each in-scope JS file's user-facing strings. Don't touch logic.
4. **`concerns.json`** — rewrite description fields, leave clinical metadata.
5. **Smoke test** — load each page in the browser, click into each section, trigger empty states (logged-out for empty Routine, no-products filter for Treatment empty, etc).
6. **Commit + push** — single commit `feat(voice): rewrite UI copy in chronically-online voice` since this is one cohesive change.

## Verification

- All 11 backend test files still pass (`npx vitest run`) — no logic touched.
- Frontend syntax-check: `node --check` on every JS file — no breakage.
- Browser smoke (Chrome DevTools MCP):
  - Landing page reads as the new voice.
  - Dashboard Overview welcome + stat card labels updated.
  - Click Treatment → category headers + filter chips + "I have this" all in voice.
  - Click Routine → hero buttons + step labels + MARK DONE + skin profile in voice.
  - Click Quick Check-in → modal title + field labels + scale labels + Save in voice.
  - Trigger no-analysis state → routine empty state in voice.
  - Trigger Treatment "My routine" filter with empty owned → empty state in voice.
- Spot-check WHY THIS panel: PMID citations + rationale text are STILL plain English (proves clinical scope is preserved).
- Spot-check Privacy page: no profanity injected.

## Risks

- **Tone misjudgment:** "shit broke" reads as broken to some users. Mitigate via consistent voice throughout — once the welcome screen sets the tone, errors fit the world.
- **Search engine snippets:** Page `<title>` tags get the new voice. SEO previews show "scan in" instead of "Analyze". Acceptable — DermAI doesn't compete on SEO right now and the founder's brand voice is the differentiation.
- **Future App Store submission:** Some app stores reject profanity in metadata. If/when iOS/Android wrap is built, the wrapper can supply alt strings via a config flag. Not building that flag now — YAGNI.
- **Onboarding plain-English screenshots:** If we ever need a "professional" demo for investors, they get the screenshot. Not building a toggle.
