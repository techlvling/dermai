# DermAI Design System

**Theme:** Soft Brutalist — light near-white background, strawberry pink primary, hard borders, no border-radius, Space Mono everywhere.
**Personality:** Direct, science-forward, trustworthy. Not clinical, not soft, not generic SaaS.

---

## Fonts

| Role | Family | Weights | Use for |
|------|--------|---------|---------|
| Display | Space Mono | 400, 700 | All headings (h1–h6), logo, stat values, eyebrows |
| Body | Space Mono | 400, 700 | Body text, nav links, buttons, labels, badges |

**Rule:** One font family. Hierarchy comes from size, weight, and letter-spacing — not font switching.

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
| `--accent-500` | `#a07cff` | Lavender — secondary highlights |
| `--accent-600` | `#7d50f5` | Lavender — links in evidence boxes |
| `--mint-500` | `#5ad8a3` | Mint — success states, low-severity badges |
| `--peach-500` | `#ffaa7a` | Peach — warnings, disclaimers |

### Surfaces
| Token | Value | Use |
|-------|-------|-----|
| `--bg-primary` | `#fafafa` | Page background |
| `--bg-card` | `#ffffff` | All card surfaces, navbar background |
| `--border-glass` | `rgba(245,88,142,0.12)` | Light dividers |

### Neutrals (warm dark)
| Token | Value | Use |
|-------|-------|-----|
| `--neutral-400` | `#a1a1aa` | Subtle text, scrollbar |
| `--neutral-500` | `#71717a` | Placeholder text, secondary labels |
| `--neutral-600` | `#52525b` | Body text (lighter), nav links |
| `--neutral-700` | `#3f3f46` | Body text (standard) |
| `--neutral-800` | `#27272a` | Primary body text |
| `--neutral-900` | `#09090b` | Headings, borders, button outlines |

---

## Spacing & Borders

- **Border-radius:** 0px everywhere. No rounding.
- **Border weight:** 2px solid `--neutral-900` for structural borders; 2px solid `--border-glass` for card dividers.
- **Spacing scale:** 4px base — `0.25rem / 0.5rem / 0.75rem / 1rem / 1.5rem / 2rem / 3rem / 4rem`.

---

## Shadows

| Token | Value | Use |
|-------|-------|-----|
| `--shadow-soft` | `4px 4px 0px rgba(9,9,11,0.08)` | Cards at rest |
| `--shadow-pop` | `4px 4px 0px #09090b` | Hard pop on hover — the brutalist signature |

**Rule:** Shadows are hard and offset (brutalist), never soft/blurred.

---

## Components

### Buttons
- `.btn-primary` — pink fill, white text, no radius. Box-shadow on hover. Active state translates 2px right+down.
- `.btn-outline` — transparent bg, 2px `--neutral-900` border. Fills black on hover.
- **All buttons:** `min-height: 44px`, `min-width: 44px` — touch target requirement.

### Cards
- `.glass-panel` / `.cute-card` — white bg, 1px `--border-glass` border, `--shadow-soft`. Aliased — use either.

### Navbar
- `.navbar` — sticky, `bg-card` background, 2px `--neutral-900` bottom border. Flex, space-between.
- `.nav-links a` — min-height 44px (touch target), uppercase, letter-spacing 0.08em.
- `.nav-hamburger` — visible below 768px only, 2px `--neutral-900` border.

### Badges
- `.badge` — 0px radius, uppercase, letter-spacing 0.06em.
- `.badge-tier-1` — pink fill for Tier 1 RCT ingredients.
- `.badge-tier-2` — mint fill for Tier 2 ingredients.

### Skip Link
- `.skip-link` — visually hidden by default (`position: absolute; top: -100%`), shown on `:focus`.

---

## Layout

- Container max-width: 1200px, padding: 0 2rem.
- Homepage sections: padding 7rem 0 on desktop.
- Hero: 2-column grid (1fr 1fr), collapses to 1 column at 900px.
- Value props: 3-column borderless grid with 44px icon boxes.
- Steps: 3-column card grid, collapses to 1 at 900px.

---

## Responsive Breakpoints

| Breakpoint | At | Behaviour |
|-----------|-----|-----------|
| Desktop | >768px | Full 3-column grids, horizontal nav |
| Mobile | ≤768px | All grids stack, hamburger nav, `.nav-links` hidden |
| Small | <480px | Hero title shrinks, buttons full-width |

---

## Accessibility Requirements

- All interactive elements: `min-height: 44px` touch target.
- Focus ring: `2px solid --neutral-900` on `:focus-visible`.
- Skip link: `.skip-link` visually hidden, shown on focus.
- `prefers-reduced-motion`: `.reveal` elements shown immediately, no animation.
- Color contrast: body text (`--neutral-800` on `--bg-primary`) passes WCAG AA.

---

## Scroll Reveal

`.reveal` starts at `opacity: 0; transform: translateY(16px)` and becomes visible when IntersectionObserver fires. `prefers-reduced-motion` users see content immediately (no opacity:0 start).

---

## What NOT to do

- No border-radius (not even on buttons, cards, or badges)
- No soft box-shadows with blur — use the hard 4px offset shadow only
- No colored icon circles — icons use bordered square boxes with colored SVGs
- No mixing in a second display font
- No glass/blur effects (despite the `.glass-panel` class name — it's a legacy alias for the card style)
