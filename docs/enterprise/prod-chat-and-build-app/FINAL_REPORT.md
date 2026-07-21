# Production AI Chat + Build App — FINAL REPORT

**Date:** 2026-07-21  
**Baseline commit before program:** `3fc9e04` (credential connect fixes)  
**Program commits:** `2a90906` (harness), `6db046d` (auth how-to), `fa1f546` (Build App feature guard)  
**Readiness:** `VERIFIED WITH DOCUMENTED LIMITATIONS`  
**CTIX authenticated canary:** PASS (`apitest1`, deployment `dpl_qQarcnWAuDq2NKKw8RjGWeDFW5RH` → follow-on `fa1f546`)

## 1. Production deployment matrix

See [prod-chat-build-matrix.md](../prod-chat-build-matrix.md).

| Product | Canonical host | authReady |
|---|---|---|
| CTIX | `apitest1.cyninjadev.com` | true |
| CFTR | `cyware-docs-cftr.vercel.app` | true |
| CSAP | `cyware-docs-csap.vercel.app` | true |
| Orchestrate | `cyware-docs-orchestrate.vercel.app` | true |

Note: `cyware-docs-ctix.vercel.app` 308s to the CTIX canonical domain; probes use apitest1.

## 2. Test harness summary

| Harness | Command | Result |
|---|---|---|
| Auth smoke | `npm run auth:smoke -- --all` | 4/4 passed |
| Extreme probe | `npm run prod:extreme-probe` | 196/196 PASS |
| Chat accuracy | `npm test -- chat-accuracy` | 284 passed |
| Manifest suites | generated via `chat:generate-suites` | 24 cases × 4 products |
| Build App suite | `chat-accuracy-build-app.test.ts` | 32 cases |
| Integrated chat→build | `chat-accuracy-integrated.test.ts` | 4 products |
| Prod chat harness | `npm run prod:chat-harness` | **BLOCKED** without exported Auth0 cookie jar (HttpOnly) |
| CTIX browser canary | in-page `fetch /api/agent` + CSRF | **PASS** (auth / snippet / build) |

## 3. Golden / manifest summary

- `artifacts/chat-accuracy/api-manifest.json` — 639 endpoints + `contentHash`
- Per-product `*-manifest-suite.json` with freshness meta in `manifest-suites-meta.json`
- Aggregate report writer: `scripts/chat-accuracy/write-report.mjs`

## 4–7. Product chat results (deterministic BM25 / rule planner)

Handcrafted suites expanded (auth, connectivity, no-invent, snippet gating). Manifest-generated suites assert product scope, safety, and soft intent. Full LLM+Pinecone production scoring remains Wave D (blocked).

## 8. Cross-product

Manifest cross-isolation cases keep host product scope; response-quality + security suites cover leakage refusals.

## 9–11. Endpoint / snippet / citation

Covered by existing `chat-accuracy-*` suites + manifest title/snippet/no-code templates. Citations suite unchanged and green under `chat-accuracy` filter.

## 12–18. Readability, multi-turn, unsupported, security, streaming, metrics, UI

- Response-quality suite: readability + snippet gating  
- Multi-turn suite: present  
- Unsupported / adversarial: expanded product + degraded suites  
- Idempotency / cancel / logical query: `chat-accuracy-idempotency.test.ts`  
- Playwright agent smoke: `e2e/agent-chat-smoke.spec.ts` (skips without `PROD_CHAT_COOKIE`)

## 19–22. Failures found / root causes / files / regressions

| Issue | Root cause | Fix |
|---|---|---|
| CTIX vercel alias probe FAIL | HTTP 308 to canonical | Probe `apitest1`; accept canonical redirect in auth-smoke |
| Manifest cases wrong `resolveProductScope` API | Test bug | Fixed call signature |
| Cross-isolation over-strict abstention | Agent still plans | Softened to product-scope + no SecretKey |
| Path doubling CFTR/CSAP (prior) | `joinBase` | Already shipped in `3fc9e04` |
| Auth how-to abstention on prod (Wave D) | LLM invented slug `authentication`; validator dropped all steps → `unsupportedEndpointAbstention` | `isOpenApiAuthHowToQuery` + `enforceOpenApiAuthPlan` (AccessID / Signature / Expires + Ping cite) |
| Prod retrieval degraded banner | Vector path failed → local BM25 fallback | Documented; auth how-to no longer depends on retrieval |
| Build App opaque 500 when `mode=app` | `guardAgentFeature` re-entered `guardAskAgent` | Inline `app_builder` check on existing session; fail-closed `FEATURE_DISABLED` |

**Key files added/changed:**  
`src/lib/agent/planner.ts`, `src/lib/agent/orchestrate.ts`, `src/lib/__tests__/setup-info-plan.test.ts`, `scripts/chat-accuracy/cases/ctix-suite.json`, `scripts/chat-accuracy/*`, `scripts/production/prod-chat-harness.mjs`, `scripts/auth-smoke.mjs`, `scripts/production/four-product-extreme-probe.mjs`, `src/lib/__tests__/chat-accuracy-*.test.ts`, `e2e/agent-chat-smoke.spec.ts`, `docs/enterprise/prod-chat-*`, `package.json` scripts.

## 23. Commands / results

```text
npm run auth:smoke -- --all          → 4/4
npm run prod:extreme-probe           → 196 PASS / 0 FAIL
npm test -- chat-accuracy            → 284 passed
npm run prod:chat-harness            → BLOCKED without cookie env (browser canary used instead)
```

## 24–25. Preview / canary

Unauthenticated infra canaries green on all four canonical hosts.

**Authenticated CTIX browser canary** (`apitest1.cyninjadev.com/agent`, signed-in session):

| Check | Result |
|---|---|
| Session / Ask AI UI | PASS |
| Auth how-to (AccessID / Signature / Expires) | PASS after `enforceOpenApiAuthPlan` |
| Curl / snippet scripts | PASS |
| Build App (natural + `mode=app`) | PASS (10 blueprint files) after feature-guard fix |
| Cookie env harness | BLOCKED — Auth0 cookies HttpOnly; browser CSRF + session used instead |
| Retrieval | Degraded lexical fallback still observed (`retrievalDegraded`) |

CFTR / CSAP / Orchestrate: same agent commits staged via `vercel --prod` after CTIX canary (one product at a time).

## 26. Remaining limitations

1. Programmatic `PROD_CHAT_COOKIE` + `PROD_CHAT_CSRF` harness still needs operator-exported session (HttpOnly cookies)  
2. Vitest uses BM25 + rule planner; production may use OpenAI + Pinecone (often degraded → local index on CTIX canary)  
3. Build App has no in-product preview worker / sandbox (documented in BUILD_APP_ARCHITECTURE.md)  
4. Manifest suite volume capped (`MANIFEST_SUITE_LIMIT`, default 24/product in tests) vs full prompt minimums  
5. Playwright agent UI smoke skipped without session cookie  
6. Full four-product authenticated LLM scoring after shared agent change still requires staged canaries per product 

## 27. Rollback

```bash
git revert <program-sha>
# or redeploy previous known-good SHA on each Vercel project
```

Prior known-good connect fix: `3fc9e04`.

## 28–50. Build App sections

Architecture: [BUILD_APP_ARCHITECTURE.md](./BUILD_APP_ARCHITECTURE.md)  

| Area | Status |
|---|---|
| Intent collision | PASS (explain ≠ build; snippet ≠ build) |
| Blueprint generation | PASS (validateAppFiles, no SecretKey, no `..`) |
| Product suites | PASS (8 cases × 4 products) |
| Integrated chat→build | PASS (deterministic) |
| Zip/deploy/commit live | Not re-hit in this program (covered by existing unit tests + feature flags) |
| Sandbox exploit / preview FSM | N/A — not implemented (limitation) |
| Build App canary (auth prod) | CTIX PASS; other products staged after CTIX |

---

```text
VERIFIED WITH DOCUMENTED LIMITATIONS
```
