# Reference Capture — Cyware Brand & Techdocs

Captured 2026-07-21 via live observation of [cyware.com](https://www.cyware.com/) and [techdocs.cyware.com](https://techdocs.cyware.com/). Values are measured/observed CSS custom properties and computed styles (not scraped assets).

**Structural rebuild note (2026-07-21):** Token capture alone is insufficient. This file now includes **structural geometry** targets for the corrective Cyware replica rebuild (`ui/structural-cyware-replica`). Marketing mega-menu / floating pill chrome from cyware.com is adapted only for brand quality on authenticated surfaces — techdocs supplies docs page grammar.

## Viewports observed

| Site | Viewport (approx.) | Notes |
|------|--------------------|-------|
| cyware.com | 2381×1339 | Marketing dark hero; floating pill header |
| techdocs.cyware.com | 2381×1339 | Light docs hub; product card grid |
| Structural targets | 1600 / 1440 / 1280 / 1024 / 768 / 430 / 390 / 360 | Rebuild evidence viewports |

Mobile density was inferred from CSS (`radius`, card padding) plus structural rebuild responsive passes.

## Structural geometry (techdocs-first)

| Measure | Target (desktop ~1440) | Role |
|---------|------------------------|------|
| Header height | 52–56px | Sticky brand + nav strip |
| Logo mark | ~28×28 | Wordmark adjacent |
| Brand wordmark | `CYWARE \| Documentation` | Split identity like TECHDOCS |
| Outer gutter | 24–32px | Page edge padding |
| Hub content max | ~1120–1152px | Product hub |
| Article max | ~720–800px | Readable column |
| Left nav rail | ~288px (18rem) | Docs tree |
| Right TOC rail | ~220–240px | On-this-page (≥ xl) |
| Card radius | 8px | Product / resource cards |
| Card padding | 12–20px | Dense techdocs cards |
| Card shadow | `0 4px 12px rgba(0,0,0,0.04)` | Subtle lift |
| Section rhythm | 40–64px | Hub section gaps |
| Tree row height | ~32–36px | Nav disclosure rows |
| Search field (hub) | Full hub width, ~48px tall | Primary discovery |
| Search field (header) | Compact ~240–320px | Global find |
| Footer | Multi-column links | Enterprise footer |

---

## cyware.com — brand tokens (CSS variables)

Observed on `:root` / design-system sheet:

| Token | Value | Role |
|-------|-------|------|
| `--cyw-blue-1` | `#004efc` | Primary brand blue / CTA |
| `--cyw-blue-2` | `#1330b9` | Deep brand blue |
| `--cyw-blue-3` | `#222b52` | Navy surface |
| `--cyw-blue-5` | `#171c38` | Deep navy |
| `--cyw-green` | `#00c689` | Accent / success / header CTA teal-green |
| `--cyw-purple` | `#a600ce` | AI / accent purple |
| `--cyw-purple-2` | `#790894` | Deep purple |
| `--cyw-purple-3` | `#290a31` | Purple dark surface |
| `--radius` | `.625rem` (10px) | Default control radius |
| `--background` | `#fff` | Light-mode page (system default) |
| `--foreground` | `#0a0a0a` | Body text |
| `--muted-foreground` | `#737373` | Secondary text |
| `--border` | `#e5e5e5` | Borders |

**Fonts:** Geist + Geist Mono loaded on marketing site.

**Header / nav (visual):** Semi-transparent floating pill nav; CYWARE wordmark + geometric mark; teal “Get Demo”; purple-tinted AI control. **Do not clone marketing mega-menus** into the docs app.

**Dark marketing hero:** Near-black canvas (`rgb(0,0,0)` body background in dark presentation) with blue radial glow — used only as brand accent inspiration for dark mode docs tokens, not as a landing-page clone.

---

## techdocs.cyware.com — docs visual language

| Token | Value | Role |
|-------|-------|------|
| `--screen-bg` | `#FFFFFF` | Page background |
| `--header-text` | `#3F375E` | Headings (navy-purple) |
| `--sub-header-text` | `#6D6882` | Supporting copy |
| `--card-header` | `#3F375E` | Card titles |
| `--card-subtext` | `#6D6882` | Card descriptions |
| `--card-boundary` | `#D5D5D5` | Card border |
| `--card-hover` | `#4A00E0` | Hover accent |
| `--main-nav-bg` | `#FFFFFF` | Header |
| `--main-nav-text` | `#1D222F` | Nav text |
| `--button-color` | `#6B10FF` | Primary purple CTA (Techdocs Assistant) |
| `--pills-text` | `#1A3EE8` | Link/pill text |
| `--side-menu-selected` | `#EEF0FB` | Selected nav row |
| `--search-box-boundary` | `#8A8D95` | Search field border |
| `--search-box-text` | `#5B637E` | Search placeholder |
| `--green-chip-border` | `#004EFC` | Intel Exchange chip |
| `--blue-chip-border` | `#00C689` | Collaborate chip |
| `--pink-chip-border` | `#AC0796` | Orchestrate chip |
| `--purple-chip-border` | `#790894` | Respond chip |
| `--ai-search-bg` | `#E2D4FF` | Soft AI surface |

**Fonts:** `Inter, sans-serif` (computed on body).

**Typography:** H1 ~32px / weight 700 / color `#3F375E`. Body color `#3F375E`.

**Cards:** ~8px radius, 12px padding, border `#D5D5D5`, shadow `rgba(0,0,0,0.04) 0px 4px 12px`.

**Layout pattern:** Centered hero (“Cyware Technical Documentation”) + search affordance + product card grid (Intel Exchange, Collaborate, Orchestrate, Respond) with short descriptions and API/Release links. Dense, clean, enterprise — not marketing-landing.

**Header:** `CYWARE | TECHDOCS` wordmark split; minimal right actions (search, Website). No mega-menu.

---

## Mapping into this app

| Product in this repo | Techdocs analogue | Accent source |
|----------------------|-------------------|---------------|
| CTIX | Intel Exchange | `--cyw-blue-1` / green-chip blue |
| CSAP | Collaborate | `--cyw-green` / teal |
| Orchestrate | Orchestrate | pink/magenta `#AC0796` |
| CFTR | Respond | purple `#790894` |

Local asset: `public/cyware_logo.png` (no remote asset scraping).
