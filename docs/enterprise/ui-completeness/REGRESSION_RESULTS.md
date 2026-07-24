# Regression Results

**Date:** 2026-07-24  
**Scope:** Signal Fabric control kit + cluster migrations (presentation only)

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | |
| `npm run lint -- --max-warnings=0` | **PASS** | |
| `npm test` | **PASS** | 157 files / 1474 tests |
| `npm run build` | **PASS** | Next.js App Router build |
| `npm run auth:smoke` | **SKIP** | Requires live product env |
| `npm run health:check` | **SKIP** | Optional ops gate |
| `npm run test:e2e` | **SKIP** | Playwright env not run this pass |

## Behavioral guarantees

- No API route contract changes
- No Auth0/Okta provisioning logic changes
- No Query Analytics metric definitions changes
- No unanswered reveal API changes
- No reCAPTCHA policy changes

## UI-focused tests added

- `src/lib/__tests__/signal-button-variants.test.ts` — token hierarchy
