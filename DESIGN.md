# DermAI Design System (refreshed 2026-05-01)

> Replaces the "Soft Brutalist + Space Mono" DESIGN.md, which described
> an earlier visual direction the codebase has since walked away from
> (commit 1f06f28: "drop the brutalist look — actually feel GenZ now").
> This file documents what the live site actually does as of master.

**Theme:** GenZ-warm soft-modern. Strawberry pink primary, warm-zinc neutrals, lavender accents, full radius scale.
**Personality:** Chronically online. Direct, science-forward, irreverent. Voice carries the brand more than typography or color.

---

## Voice (load-bearing)

The voice is the strongest brand signal on the site. Examples:
- "ai roasts ur skin so derms don't have to" (h1)
- "no fluff just the receipts" (h2)
- "we clock what's going on" / "we pick what actually works"
- "let's see what we're working with" (analyze.html)
- "wtf is dermal" (section eyebrow)

Rules:
- Lowercase by default, including section eyebrows. Title-case only when emphasizing a single noun.
- Use chronically-online vocabulary ("clocks", "receipts", "no fluff") sparingly — once per section, not once per sentence.
- Active voice, second person, contractions.
- No hedging ("might", "could potentially"). Either say it or don't.

---

## Fonts

| Role | Family | Weights | Use for |
|------|--------|---------|---------|
| Display | DM Sans | 500, 700 | h1–h3, hero, big numbers, CTA labels |
| Body | Inter | 400, 500, 600, 700 | body text, nav, small labels, form fields |

Loaded together via Google Fonts in `css/variables.css`:
```css
--font-primary: 'Inter', system-ui, -apple-system, sans-serif;
--font-display: 'DM Sans', 'Inter', system-ui, sans-serif;
```

**Rule:** Don't introduce a third typeface. Hierarchy comes from size + weight inside this two-font system.

**Minimum sizes:** body ≥ 16px, captions/labels ≥ 12px (0.75rem). Never go below 12px on any rendered text.

---

## Color tokens

All defined in `frontend/css/variables.css`. Reference via `var(--token)`, never hardcode hex.

### Primary — Strawberry Pink
| Token | Value | Use |
|-------|-------|-----|
| `--primary-50`  | `#fff0f5` | tinted backgrounds, hover wash |
| `--primary-100` | `#ffe0eb` | chip backgrounds at low alpha |
| `--primary-300` | `#ff85ab` | subtle borders |
| `--primary-500` | `#f5588e` | **brand color** — primary CTAs, links, headline accent |
| `--primary-600` | `#d83d72` | hover on primary, pressed states |
| `--primary-700` | `#a82456` | high-severity badges, eyebrow text |
| `--primary-900` | `#4d0a28` | rare, only for very dark accent text |

### Accent — Lavender
Used for evidence panels, secondary highlights, the bottom CTA gradient.
| Token | Value |
|-------|-------|
| `--accent-100` | `#ede5ff` |
| `--accent-300` | `#c2b5ff` |
| `--accent-500` | `#a07cff` |
| `--accent-600` | `#7e58e8` |
| `--accent-700` | `#5b3da8` |

### Accent — Mint (success)
| `--mint-300` | `#a8f0d0` |
| `--mint-500` | `#34c4a3` |

### Accent — Peach (warnings, disclaimers)
| `--peach-300` | `#ffd1b8` |
| `--peach-500` | `#ffb380` |

### Mood (charts, tags)
| `--coral-500` | `#ff7a59` |
| `--calm-500`  | `#5b8def` |
| `--relax-500` | `#8a6dd6` |

### Neutrals — Warm Zinc
| Token | Value | Use |
|-------|-------|-----|
| `--neutral-50`  | `#fafaf7` | surface, page background |
| `--neutral-100` | `#f3f1ec` | subtle card backgrounds |
| `--neutral-200` | `#e8e4dc` | borders, dividers |
| `--neutral-300` | `#d0cbc0` | disabled states |
| `--neutral-400` | `#a09890` | placeholder text (use sparingly — fails contrast as small text) |
| `--neutral-500` | `#716b62` | muted text, captions |
| `--neutral-600` | `#524d46` | secondary body text |
| `--neutral-700` | `#3a3630` | body text |
| `--neutral-800` | `#252220` | headings |
| `--neutral-900` | `#1a1714` | strongest text emphasis |

### Semantic
| `--success` | `#34c4a3` |
| `--warning` | `#ffb380` |
| `--error`   | `#f5588e` (same as primary — re-evaluate; brand and error sharing a hue is risky) |
| `--info`    | `#5b8def` |

### Surfaces
| `--bg-primary`   | `#fafaf7` | page background |
| `--bg-secondary` | `#f3f1ec` | section background |
| `--bg-card`      | `#ffffff` | cards |
| `--bg-glass`     | `rgba(255,255,255,0.92)` | floating panels |
| `--border`       | `#e8e4dc` | default border |

### Text shortcuts
| `--text-strong` | `#1a1714` |
| `--text-body`   | `#3a3630` |
| `--text-muted`  | `#716b62` |

---

## Radii

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm`   | `8px`    | small chips, tags, inputs |
| `--radius-md`   | `16px`   | cards, modals, buttons |
| `--radius-lg`   | `24px`   | hero cards, big features |
| `--radius-pill` | `9999px` | pills, chips, scroll thumbs, primary buttons |

---

## Shadows

```
--shadow-sm    0 1px 2px rgba(20,20,14,0.06)
--shadow-soft  0 1px 3px rgba(20,20,14,0.06), 0 4px 12px rgba(20,20,14,0.06)
--shadow-md    0 6px 20px rgba(20,20,14,0.08), 0 2px 6px rgba(20,20,14,0.06)
--shadow-pop   0 6px 20px rgba(20,20,14,0.10), 0 2px 6px rgba(20,20,14,0.06)
--shadow-lg    0 16px 48px rgba(20,20,14,0.12)
--shadow-glow  0 0 0 3px rgba(245,88,142,0.18)   ← focus ring on primary
```

---

## Motion

```
--duration-fast 80ms
--duration-base 150ms
--ease-out cubic-bezier(0.16, 1, 0.3, 1)
--ease-in  cubic-bezier(0.4, 0, 1, 1)
```

Reveals (`.reveal` → `.reveal.visible`) use `0.5s ease-out` for opacity + `translateY(16px)` → 0 entry.

`prefers-reduced-motion`: all reveals show instantly, transitions disabled.

---

## Spacing

**Gap:** No spacing-token system today. ~5500 lines of CSS use ad-hoc px/rem values. The de-facto rhythm in `landing.css`/`base.css`:

| Context | Padding |
|---------|---------|
| Section vertical | `80px 0` (mobile: 48–64px) |
| Container horizontal margin | `0 40px` (mobile: 16–20px) |
| Card | `24px` |
| Hero | `64px 32px` |
| Button | `0.75rem 1.5rem` |

**Recommendation (future, not yet adopted):** introduce a 4px-base scale —
```
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
--space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
--space-20: 80px;
```
and migrate hard-coded values incrementally. Keep this OUT of the design tokens until you're ready to do the migration; an unused scale invites drift.

---

## Component patterns

### Section eyebrow chip (`.section-eyebrow`)
Lowercase pink pill above every section heading. 12px (was 11.2px before 2026-05-01 fix), weight 800, `--primary-700` text on `rgba(245,88,142,0.12)` background, `border-radius: 999px`, `padding: 0.35rem 0.9rem`.

### Primary button (`.btn-primary`)
14px text, white on `--primary-500`, `border-radius: var(--radius-pill)`, hover lifts to `--primary-600`. Note: white-on-pink contrast is ~3.14:1 — passes WCAG AA only if the label is bold-weight (≥14px bold) or large (≥18.66px). Current button text is bold/semibold so it passes; verify before lowering weight.

### Cards (`.feature-card`, `.value-prop`, etc.)
White background, `border-radius: var(--radius-md)` (16px), `padding: 24px`, `box-shadow: var(--shadow-soft)`. Hover: lift via `transform: translateY(-2px)` + `--shadow-pop`.

### Reveal animation (`.reveal`)
Default `opacity: 0; transform: translateY(16px)`. IntersectionObserver in `js/animations.js` adds `.visible` when ≥12% of the element enters viewport. **Plus** a 2.5s setTimeout fail-safe (added 2026-05-01) so content can't be permanently invisible if JS errors. `prefers-reduced-motion` shows everything instantly.

---

## Hard rules (apply on every PR)

- ≥ 12px on any rendered text
- ≥ 32px tap area on every interactive element (44px ideal)
- All color values via `var(--token)`, no hex literals in component CSS
- Two-font system only (DM Sans + Inter)
- Don't ship a 3-column "icon-circle + title + 2-line description" grid as the dominant landing layout
- All reveals MUST have a no-JS or JS-error fallback path
- Vercel Web Analytics and other prod-only scripts must be hostname-gated
- One job per section. If you can delete 30% of the copy without losing meaning, delete it.

---

## What this replaces

The previous DESIGN.md described:
- Soft Brutalist visual language → **dropped** (commit 1f06f28)
- Space Mono everywhere → **dropped** (now Inter + DM Sans)
- "no border-radius / hard borders" → **dropped** (full radius scale in use)
- Strawberry pink primary → **kept**
- Direct/trustworthy voice → **kept**, evolved into chronically-online

If you want to revert toward the brutalist direction, do it intentionally as a redesign — don't let the codebase keep drifting and the doc keep lagging.
