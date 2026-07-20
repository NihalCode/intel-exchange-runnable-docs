# Codeflow Remaining Issues — Disposition Report (inferred, no export)

**Commit baseline:** `51bcbd0`  
**Branch:** `enterprise/codeflow-fp-and-hardening`  
**Approach:** No Codeflow export — infer from repo. Fix listed security/scanner items; harden ingest spawn (keep intentional-safe); split `app-builder.ts`; add architecture gates; document unverified Codeflow counts.

**Internal health (pre-work):** 96.5 / 0 critical/high / 0 cycles

## Finding dispositions

| Finding | File | Source Class | Real Risk | Fix/Disposition | Regression Test | Rescan |
|---|---|---|---|---|---|---|
| Command Execution | `ingest-runtime.ts` | production_server | Intentional admin job | Hardened: `shell:false`, allowlisted argv, timeout, output caps, scrubbed env | `ingest-runtime-safety.test.ts` | Keep intentional_safe |
| Dynamic Code Execution | `validate-app.ts` | production_server (detector) | No — detector only | Moved to `generated-code-policy.ts` | `generated-code-policy.test.ts` | FP if substring |
| Dynamic Code Execution | `planner.ts` / `orchestrate.ts` / `normalize-query.ts` | production_server | No | Keep `*Retrieval*` names; AST negative fixtures | `health-analyzer.test.ts` | External FP |
| Dynamic / Function | `__tests__/*` | test | No | Fixtures in `fixtures/dangerous-code-samples.ts` | security-residuals | External FP |
| Dynamic / Function | `scripts/health/*`, docs, AGENTS.md | analyzer/docs | No | Keep docs; classifier excludes docs from internal scan | health-analyzer | External FP |
| Circular dependency | (Codeflow claim) | — | Unverified | Internal scan: **0 cycles**; TF-001 already fixed | `architecture-gates.test.ts` | Needs Codeflow export |
| Large file | `app-builder.ts` | codegen | Quality | Split into boilerplate/css/routes + facade (~100 lines) | existing agent tests | Re-scan |
| Duplicated-code ×11 | (Codeflow claim) | — | Unverified | No export — not consolidated blindly | — | Needs export |
| Architecture ×99 | (Codeflow claim) | — | Unverified | Added architecture gates; no layer rewrite without evidence | `architecture-gates.test.ts` | Needs export |

## Unverified Codeflow counts

Without a scan export, these Codeflow totals cannot be mapped to file:line:

- 1 circular dependency (internal: 0)
- 11 duplicated-code groups
- 99 architecture violations

Treat them as **blocked on evidence** until a Codeflow export is provided. Do not guess refactors.

## Commands

```text
npm test
npx tsc --noEmit
npm run lint
npm run health:check
npm run test:e2e
npm run build
```

## Rollback

```bash
git revert <sha>
git push origin main
```
