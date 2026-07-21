# Design Analysis — Enterprise Docs UI

## Goals

Bring the runnable docs + admin control plane into Cyware’s **techdocs** visual language: restrained navy/blue brand, product-colored accents, clean density, enterprise (not marketing).

## Principles

1. **Docs-first density** — Prefer techdocs card/grid and sidebar selection treatment over cyware.com marketing hero/glow/mega-menu.
2. **One token system** — Semantic CSS variables in `globals.css`; Tailwind/admin class helpers in `src/components/admin/ui/tokens.ts` consume those vars.
3. **Product identity** — CTIX / CSAP / Orchestrate / CFTR each have a stable accent token used on badges, product cards, and subtle nav cues.
4. **Frame naming** — Keep `AppFrame` / `AdminFrame` / `ConditionalAppFrame` (no Shell rename regression).
5. **No parallel UI kits** — Upgrade admin/ui primitives; thin `src/components/ui/` re-exports only when docs need the same components.
6. **Behavior unchanged** — SecretKey rules, Viewer cannot Run, Ask AI permission gates, MFA/SSO, feedback/reCAPTCHA, migrations 010/011 stay intact.
7. **No fake marketing** — No scraped hero art, no invented metrics, no `dangerouslySetInnerHTML` for design.

## Target surfaces

| Surface | Direction |
|---------|-----------|
| App header | Logo + “Documentation” product identity; compact nav; theme toggle; permission-aware Ask AI |
| Home | Techdocs-style product hub + real `/api/docs/search` |
| Docs reader | Breadcrumbs, TOC when headings exist, prev/next, prose tokens |
| Endpoint / playground | Visual polish only; Run/creds/Viewer unchanged |
| Ask AI | Sidebar \| chat \| sources/Build App; no emoji markers |
| Admin | Same tokens, denser control plane; Support Agent clearly labeled mock |
| Auth / credentials | Branded sign-in + CredentialManager surfaces |

## Typography

Apply **Geist** (already loaded in `layout.tsx`) consistently to `body` so marketing and docs share one intentional stack. Mono: Geist Mono for code. (Techdocs uses Inter; Geist is Cyware.com’s loaded face and already vendored — prefer consistency over introducing a second webfont.)

## Color strategy

- Light mode mirrors techdocs: white page, `#3F375E`-family headings, soft borders.
- Dark mode uses cyware navy blues (`--cyw-blue-3/5`) as surfaces, not pure `#0a0a0a` flat black alone.
- Brand interactive: `--cyw-blue-1` for primary actions; product accents for badges only.

## Spacing / layout

- Header height ~49–56px sticky.
- Docs sidebar ~18rem.
- Content max-width ~56rem (docs) / ~72rem (hub).
- Card radius 8–10px; focus ring uses brand blue.
