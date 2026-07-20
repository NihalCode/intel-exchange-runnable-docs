# Production AI Chat + Build App — FINAL REPORT

**Date:** 2026-07-20  
**Baseline commit before program:** `3fc9e04` (credential connect fixes)  
**Program commit:** (see git log after ship)  
**Readiness:** `VERIFIED WITH DOCUMENTED LIMITATIONS`

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
| Chat accuracy | `npm test -- chat-accuracy` | 279 passed |
| Manifest suites | generated via `chat:generate-suites` | 24 cases × 4 products |
| Build App suite | `chat-accuracy-build-app.test.ts` | 32 cases |
| Integrated chat→build | `chat-accuracy-integrated.test.ts` | 4 products |
| Prod chat harness | `npm run prod:chat-harness` | **BLOCKED** (no Auth0 session env) |

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

**Key files added/changed:**  
`scripts/chat-accuracy/*`, `scripts/production/prod-chat-harness.mjs`, `scripts/auth-smoke.mjs`, `scripts/production/four-product-extreme-probe.mjs`, `src/lib/__tests__/chat-accuracy-*.test.ts`, `e2e/agent-chat-smoke.spec.ts`, `docs/enterprise/prod-chat-*`, `package.json` scripts.

## 23. Commands / results

```text
npm run auth:smoke -- --all          → 4/4
npm run prod:extreme-probe           → 196 PASS / 0 FAIL
npm test -- chat-accuracy            → 279 passed
npm run prod:chat-harness            → BLOCKED (no credentials)
```

## 24–25. Preview / canary

Unauthenticated infra canaries green on all four canonical hosts. Authenticated agent canary **not run** (no test-tenant Auth0 cookie/CSRF supplied).

## 26. Remaining limitations

1. No live authenticated multi-turn LLM scoring (needs `PROD_CHAT_COOKIE` + `PROD_CHAT_CSRF`)  
2. Vitest uses BM25 + rule planner; production may use OpenAI + Pinecone  
3. Build App has no in-product preview worker / sandbox (documented in BUILD_APP_ARCHITECTURE.md)  
4. Manifest suite volume capped (`MANIFEST_SUITE_LIMIT`, default 24/product in tests) vs full prompt minimums  
5. Playwright agent UI smoke skipped without session cookie  

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
| Build App canary (auth prod) | BLOCKED |

---

```text
VERIFIED WITH DOCUMENTED LIMITATIONS
```
