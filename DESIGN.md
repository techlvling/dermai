# DermAI Design System

**Theme:** Cutiepie Pastel — light cream background, strawberry pink primary, pastel rainbow accents.
**Personality:** Friendly, trustworthy, science-backed but approachable. Not clinical, not cold.

---

## Fonts

| Role | Family | Weights | Use for |
|------|--------|---------|---------|
| Display | Fredoka | 400, 500, 600, 700 | All headings (h1–h6), logo, stat values, step numbers |
| Body | Figtree | 400, 500, 600, 700 | Body text, nav links, buttons, labels, badges |

**Rule:** Fredoka is for anything the user scans first. Figtree is for anything the user reads.

---

## Color Tokens

### Primary — Strawberry Pink
| Token | Value | Use |
|-------|-------|-----|
| `--primary-400` | `#ff7aa8` | Hover states, subtle borders |
| `--primary-500` | `#f5588e` | Primary action color — buttons, links, icons |
| `--primary-600` | `#e63977` | Hover on primary, active states |
| `--primary-700` | `#c91f5d` | High-severity badges, warning text |

### Accents
| Token | Value | Use |
|-------|-------|-----|
| `--accent-500` | `#a07cff` | Lavender — secondary highlights, evidence rationale borders |
| `--accent-600` | `#7d50f5` | Lavender — links in evidence boxes |
| `--mint-500` | `#5ad8a3` | Mint — success states, low-severity badges, step 3 |
| `--peach-500` | `#ffaa7a` | Peach — warnings, disclaimers, stale banners |

### Surfaces
| Token | Value | Use |
|-------|-------|-----|
| `--bg-primary` | `#fff7f5` | Page background (cream-blush) |
| `--bg-secondary` | `#ffeef2` | Footer, secondary panels |
| `--bg-card` | `#ffffff` | All card surfaces |
| `--border-glass` | `rgba(245,88,142,0.12)` | Card borders, dividers |

### Neutrals (warm rose-gray)
| Token | Value | Use |
|-------|-------|-----|
| `--neutral-500` | `#b07c8a` | Placeholder text, secondary labels |
| `--neutral-600` | `#87596a` | Body text (lighter) |
| `--neutral-700` | `#5e3a48` | Body text (standard) |
| `--neutral-800` | `#3a2230` | Primary body text |
| `--neutral-900` | `#2d1822` | Headings |

---

## Spacing & Radii

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | `12px` | Badges, input fields, small panels |
| `--radius-md` | `20px` | Feature cards, stat tiles, preview cards |
| `--radius-lg` | `28px` | Main cards, FAQ items, CTA banner |
| `--radius-pill` | `9999px` | Buttons, tags, trust badges |

Spacing scale: 4px base — use `0.25rem / 0.5rem / 0.75rem / 1rem / 1.5rem / 2rem / 3rem / 4rem`.

---

## Shadows

| Token | Value | Use |
|-------|-------|-----|
| `--shadow-soft` | `0 8px 30px rgba(245,88,142,0.10)` | Cards at rest |
| `--shadow-pop` | `0 14px 40px rgba(245,88,142,0.20)` | Cards on hover, scan card hero |

---

## Components

### Buttons
- `.btn-primary` — pink gradient pill, white text. Use for primary CTA.
- `.btn-outline` — pink border, transparent bg. Use for secondary action. Fills pink on hover.
- `.btn-large` — larger padding for hero CTAs.
- All buttons: `min-height: 44px` (touch target).

### Cards
- `.glass-panel` / `.cute-card` — white bg, `--shadow-soft`, `--radius-lg`, `--border-glass` border. These are aliased — use either class name.

### Badges
- `.badge-tier-1` — pink pill for Tier 1 RCT ingredients.
- `.badge-tier-2` — mint pill for Tier 2 ingredients.
- `.severity-badge` — base pill class. Combine with `.severity-high/medium/low` for color.

### Severity
- `.severity-low` — mint bg, dark green text.
- `.severity-medium` — peach bg, amber text.
- `.severity-high` — pink bg, dark pink text.

### Typography classes
- `.section-eyebrow` — 0.7rem, uppercase, tracked, `--primary-500`. Appears above every section title.
- `.gradient-text` — animated pink→lavender→peach gradient clip. Use on key headline words.
- `.reveal` — opacity:0 initially, fades in on scroll via IntersectionObserver.

### Navigation
- `.navbar` — sticky, frosted-glass blur on scroll. Max-width 1200px container.
- `.nav-drawer` — mobile slide-in panel from right. Toggle via `js/nav.js`.

### Evidence Rationale
- `.evidence-rationale` — lavender bg (`rgba(160,124,255,0.08)`), lavender left-border. Used in recommendations cards for "WHY THIS?" box.
- `.evidence-rationale-label` — small all-caps label inside the box.

---

## Layout

- Container max-width: `1200px`, padding: `0 2rem`.
- Sections: `padding: 7rem 0` on desktop.
- Hero: 2-column grid (`1fr 1fr`), collapses to 1 column at 900px.
- Value-props: 3-column borderless grid, collapses to 1 at 900px.
- Steps: 3-column card grid, collapses to 1 at 900px.
- Features: 3×2 grid, 2×3 at 1024px, 1-column at 600px.
- FAQ: single column, max-width 720px, centered.

---

## Responsive Breakpoints

| Breakpoint | At | Behaviour |
|-----------|-----|-----------|
| Desktop | >1024px | Full 3-column grids |
| Tablet | 900–1024px | Features grid → 2 columns |
| Mobile | <900px | Hero stacks, all grids → 1 column |
| Small | <480px | Hero title shrinks to 2.6rem, buttons stack full-width |

---

## Accessibility Requirements

- All interactive elements: `min-height: 44px` touch target.
- Focus ring: `3px solid var(--primary-400)` on `:focus-visible`.
- Color contrast: body text (`--neutral-800` on `--bg-primary`) passes WCAG AA.
- `prefers-reduced-motion`: all animations disabled, `.reveal` elements shown immediately.
- Skip link present on all pages.
- Section headings use `aria-labelledby` referencing their `id`.

---

## Background Ambient Blobs

3 fixed blobs (pink, lavender, peach) with `blur(70px)` and slow float animations. These are intentional brand atmosphere — not decoration to remove. They sit at `z-index: 0`, content at `z-index: 1`.
