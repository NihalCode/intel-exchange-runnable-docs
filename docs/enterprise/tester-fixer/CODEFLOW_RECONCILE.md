# Codeflow 72 vs internal 96.3 reconcile

See also [CODEFLOW_VS_INTERNAL_HEALTH.md](../CODEFLOW_VS_INTERNAL_HEALTH.md).

## Score gap (Wave A)

| Scanner | Score | Open high/critical |
|---|---|---|
| External Codeflow (observed) | ~72 / C | Reported 6 high (mostly FPs / naive text) |
| Internal `health:scan` (post cycle fix) | **96.3** | **0** |
| Naive regex baseline (internal) | ~54 | Illustrative only |

## Category mapping

| Codeflow label | Verified outcome |
|---|---|
| XSS (layout theme) | Safe hardcoded script → further polish: static `/theme-init.js` |
| XSS (CodeBlock hljs) | hljs escapes; accepted + regression tests |
| Shell / command execution | Single `spawn(execPath, argv)` — not shell injection |
| Dynamic code / Function | Test-fixture string FPs only |
| SQL injection | Parameterized paths; no confirmed prod SQLi |
| Circular deps | **Confirmed** auth cycle — **fixed** via `env-values.ts` |
| Large / coupled files | Real maintainability debt — Wave C |
| Debug / TODO | Mostly CLI/scripts/tests — Wave C hygiene |

## Neutral verification

- `src/lib/__tests__/health-xss-safety.test.ts` — XSS payloads through theme + hljs paths
- `npm run health:check` — AST gate, fails on open critical/high
- Auth base-url unit tests — env resolution without cycles

## Unresolved for external rescan

External Codeflow must re-scan the authenticated correct tree after Program 1. Pack produced in Phase 26.
