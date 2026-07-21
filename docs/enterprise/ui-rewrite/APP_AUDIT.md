# App Audit — Current Gaps vs Target

Audit date: 2026-07-21. Scope: visual/UX only unless noted.

## Frame & chrome

| Area | Current | Gap |
|------|---------|-----|
| AppFrame brand | Text-only “Cyware Documentation”; no logo | Use `public/cyware_logo.png` + product identity |
| ThemeToggle | Duplicated in AppFrame + AdminHeader; render-time setState anti-pattern | Shared `ThemeToggle` with effect-based sync |
| Nav | Functional but zinc/sky generic | Tokenized surfaces, denser techdocs feel |
| Ask AI | Permission-aware (good) | Keep gate; polish link styles |
| AdminFrame | Plain “Enterprise Admin” text | Logo + denser sidebar/header tokens |
| Shell naming | Already Frame (tests exist) | Preserve; extend characterization tests |

## Design system

| Area | Current | Gap |
|------|---------|-----|
| globals.css | Only `--background` / `--foreground` | Full semantic + product + spacing tokens + dark |
| Fonts | Geist CSS vars set but body uses system stack | Apply Geist to body |
| admin/ui/tokens.ts | Hardcoded zinc/sky Tailwind | Map to CSS vars / shared helpers |
| Shared Button | Classes only | Formalize helpers; optional thin `ui/` re-export |

## Home / search

| Area | Current | Gap |
|------|---------|-----|
| Product cards | Present (4 products) | Align with techdocs card density/accents |
| Search form | `action="/docs/ctix"` — **does not search** | Wire to `/api/docs/search` client UI |

## Docs reader

| Area | Current | Gap |
|------|---------|-----|
| Breadcrumbs | Missing on docs pages | Add |
| TOC / prev-next | Missing or weak | Add for section pages with headings |
| Prose | Default typography plugin | Token-aware `prose` colors |
| EndpointView / CodeBlock | Functional | Surface/border polish only |

## Ask AI / auth

| Area | Current | Gap |
|------|---------|-----|
| Empty state | Emoji ✨ | Replace with icon/SVG |
| Feedback | Emoji 👍👎 | SVG icons; keep API |
| Layout | Good three-pane start | Tighten tokens/spacing |
| CredentialManager / sign-in | Logo already on sign-in | Align cards/buttons to tokens |
| Settings | Functional | Visual polish |

## Admin

| Area | Current | Gap |
|------|---------|-----|
| Overview / analytics / unanswered / weekly | Functional | Token polish |
| Support Agent | Mock + PLACEHOLDER_NOTICE | Stronger “not live” labeling |
| Sensitive reveal | Permissioned | Keep |
| Deployments/domains/users/security | In place | Restyle only |

## Feature gating

| Area | Current | Gap |
|------|---------|-----|
| `enterprise_ui_v2` | Absent | Optional key; prefer new UI as default visual system with flag default-enabled for tokens if used |

## Non-goals (confirmed intact)

- No backend/API rewrites; migrations 010/011 untouched
- MFA/SSO, Viewer gates, feedback/reCAPTCHA behavior preserved
- SecretKey never persisted; Viewer cannot Run
