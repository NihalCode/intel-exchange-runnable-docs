# Tester/Fixer Phase 0 — Baseline

Recorded on branch `enterprise/tester-fixer-polisher` from `main` @ `ab56df7`.

## Environment

| Item | Value |
|---|---|
| Commit SHA | `ab56df7e13214675c6cc31ef7ee07286b309c58a` (pre-fix baseline) |
| Branch | `enterprise/tester-fixer-polisher` |
| Node | v24.13.0 (engines `>=20 <25`) |
| npm | 11.6.2 |
| Lockfile SHA256 | `41F4DA1CF9AEE38D06EEF959A281F8CBD5B653013EE1851E949A3EA0BECC6E01` |
| Migrations | `001`–`008` under `src/lib/db/migrations/` |
| Products | CTIX, CSAP, CFTR, Orchestrate (`cyware-docs-*`) |
| Internal health (pre-fix) | 81.3 with **1 high** circular-dependency |
| Internal health (post cycle fix) | **96.3**, 0 open critical/high (`health:check` PASS) |
| External Codeflow | ~72/C (not re-run in-repo; see reconcile doc) |

## Gate results (Wave A)

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | |
| `npm run lint -- --max-warnings=0` | PASS after fixes | Was FAIL: Date.now purity + unused imports |
| `npm test` | PASS | 113 files / 853 tests |
| `npm run security:scan-secrets` | PASS | |
| `npm run archive:check` | EXPECTED FAIL on dev cwd | Local `.env*`, `.data/`, `.cursor/` present; use on export staging only |
| `npm run health:scan` / `health:check` | PASS after cycle break | Was FAIL on circular-dependency |
| `npm run build` | Deferred to Wave G / final gate | |
| `npm run test:e2e` | Deferred to Wave G / final gate | |

## Early confirmed defects fixed in Wave A

1. **Circular dependency (high):** `auth-config-public.ts` ↔ `base-url.ts` — extracted leaf `env-values.ts`.
2. **Lint:** query-analytics `Date.now` purity; unused imports in deployment/domains/snippets/auth env.

## Inventories

See sibling files in this folder: `INVENTORY.md`, `FINDING_LEDGER.json`, `CODEFLOW_RECONCILE.md`.
