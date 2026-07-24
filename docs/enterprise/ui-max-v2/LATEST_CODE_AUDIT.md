# Latest Code Audit — Cyware Signal Fabric 2.0

**Workspace:** `intel-exchange-ui-fabric` · **Branch:** `frontend` @ `e7c853e` (matching main at start)

## Runtime confirmed

| Layer | Version / note |
|---|---|
| Next.js | 16.x App Router |
| React | 19.x |
| Tailwind | v4 |
| Auth | Auth0 SDK + Okta Workforce connection |
| Tests | Vitest |

## Structural foundation retained

- `cx-app-shell`, `cx-header`, `cx-product-strip`, `cx-docs-reader`, `cx-ask-workspace`, `cx-admin-shell`, `cx-split-auth`
- `enterprise_ui_v2` feature key (default ON)
- Product accent classes (`product-accent-*`)
- Geist typography stack
- Reduced-motion rules and focus-visible rings
- Structural replica markers required by `structural-ui-replica.test.ts`

## Gaps addressed in this wave

| Limitation (prior UI rewrite) | Treatment |
|---|---|
| Generic card residue / MetricCard grids | `sf-signal-metric`, telemetry strip, operational headers |
| Plain admin secondary pages | Shared PageHeader + fabric materials; dashboard topology |
| Incomplete Ask AI / Build App polish | Workspace header signal, build-studio action dock tokens |
| Plain users table / add-user form | Identity command header + tokenized form surfaces |
| Limited motion / materials | Signal traces, pulses, atmosphere, elevation scale |
| Bland home / auth | Cinematic hub hero, elevated split-auth security panels |

## Non-goals (frozen)

Routes, APIs, auth/session, Okta provisioning outcomes, analytics definitions, reCAPTCHA policy, feature-flag semantics, fake Support Agent modules.
