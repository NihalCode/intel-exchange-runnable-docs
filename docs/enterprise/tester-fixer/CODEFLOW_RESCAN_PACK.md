# Codeflow rescan pack (Phase 26)

## What to re-scan

Authenticated clone of this branch (or `main` after merge), **application source only** preferred:

- Include: `src/**`
- Prefer exclude (or classify as non-app): `scripts/**`, `**/__tests__/**`, `docs/**`, `src/content/**`, `node_modules/**`, `.next/**`

## Fixes that should clear naive High cards

| Prior Codeflow card | Remediation |
|---|---|
| XSS layout theme | Removed `dangerouslySetInnerHTML`; static `public/theme-init.js` + `next/script` |
| XSS CodeBlock | React-token renderer via `renderHljsHtml` — no HTML sink |
| Shell command | Still single `spawn(execPath, argv)`; no shell; argv NUL reject |
| Circular dependency | Broken via `env-values.ts` leaf module |
| Dynamic code / Function | Still test-fixture FPs only — classify as non-app |

## Internal verified score

Run `npm run health:check` — target ≥96.5 with **0** open critical/high.

## Evidence files

- `docs/enterprise/tester-fixer/BASELINE.md`
- `docs/enterprise/tester-fixer/CODEFLOW_RECONCILE.md`
- `docs/enterprise/tester-fixer/FINDING_LEDGER.json`
- `src/lib/__tests__/health-xss-safety.test.ts`
- `src/lib/__tests__/ingest-runtime-safety.test.ts`
- `src/lib/__tests__/enterprise-authz-matrix.test.ts`
