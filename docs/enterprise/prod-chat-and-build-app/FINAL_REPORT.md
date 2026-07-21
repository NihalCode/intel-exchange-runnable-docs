# Production AI Chat + Build App — FINAL REPORT

**Date:** 2026-07-21  
**Baseline:** `3fc9e04`  
**Key commits:** `2a90906` · `6db046d` (auth how-to) · `fa1f546` (Build App guard) · `f82c4d4` (HTTP 401/4xx) · `dad2471` (extreme suites + retrieval health) · `afa8ebd` (host-pinned product allowlist) · `81b7d4f` (Build App product label + credentials lead) · `445aff7` (non-CTIX sidebar nav)  
**Readiness banner:** `VERIFIED WITH DOCUMENTED LIMITATIONS`

Do **not** claim `ALL FOUR PRODUCTION CHAT PRODUCTS VERIFIED` without caveats — in-product preview sandbox (Phases 36–39) does not exist; full ~100 live LLM cases per product and Safari UI farm are not finished. Authenticated Ask AI canaries **PASS on all four hosts** with hybrid retrieval.

---

## 1. Production deployment matrix

See [prod-chat-build-matrix.md](../prod-chat-build-matrix.md).

| Product | Canonical host | authReady | Retrieval health | Authenticated chat canary |
|---|---|---|---|---|
| CTIX | `apitest1.cyninjadev.com` | true | `hybrid_ok` | **PASS** (auth, 401, keys, list; hybrid) |
| CFTR | `cyware-docs-cftr.vercel.app` | true | `hybrid_ok` | **PASS** (host-pinned allowlist; hybrid) |
| CSAP | `cyware-docs-csap.vercel.app` | true | `hybrid_ok` | **PASS** (host-pinned allowlist; hybrid) |
| Orchestrate | `cyware-docs-orchestrate.vercel.app` | true | `hybrid_ok` | **PASS** (auth, 401, keys, playbooks; hybrid) |

Infra probes: `auth:smoke --all` 4/4 · `prod:extreme-probe` 196/196 PASS.

---

## 2. Test harness summary

| Harness | Result |
|---|---|
| `npm test -- chat-accuracy` | **452 passed** (pre-expansion baseline; re-run after latest commits as needed) |
| Manifest suites | **360 cases × 4 products** |
| Build App suite | **31 cases × 4 products** |
| Multiturn suite | Expanded |
| Prod chat harness (`PROD_CHAT_*`) | Scaffold exists; cookie-env still blocked (HttpOnly Auth0) |
| Browser canary | **CTIX + CFTR + CSAP + Orchestrate PASS** via in-page CSRF + `/api/agent` |
| Retrieval health | `/api/health/retrieval` → `hybrid_ok` on all four hosts |

---

## 3. Golden / manifest

- `artifacts/chat-accuracy/api-manifest.json` — 639 endpoints + `contentHash`
- Generated suites meet extreme category floors without inventing endpoints
- Freshness meta: `manifest-suites-meta.json`

---

## 4–18. Chat accuracy (local BM25 + rule enforcers)

Deterministic suites cover product scope, auth (AccessID/Signature/Expires), 401/429, snippets, no-invent, adversarial, multiturn, citations, degraded mode, idempotency, Build App intent collision.

Production OpenAI+Pinecone path: **healthy** on all four hosts (`reasonCodes: ["hybrid_ok"]`, index `intel-exchange-docs`, namespaces `product-{ctix,cftr,csap,orchestrate}`).

---

## 19–22. Defects fixed this program

| Issue | Fix |
|---|---|
| Auth how-to abstention (`authentication` slug) | `enforceOpenApiAuthPlan` |
| Build App opaque 500 | Inline `app_builder` flag check (no double `guardAskAgent`) |
| HTTP 401 invents auth endpoint | `enforceHttpStatusGuidancePlan` |
| Separate-keys phrasing weak | Stronger `isCredentialsQuery` + credentials-lead copy |
| Suite volume below prompt floors | Generator quotas → 360/product |
| Build App &lt;30/product | Expanded to 31/product |
| Pinecone failure opaque | `reasonCode` on query + retrieval health endpoint |
| CFTR Ask AI “Not connected” without CFTR keys | Host-pinned `ensureProductId` allowlist |
| Build App labeled CTIX on CFTR | `planAppFromRetrieval(..., productId)` |
| Non-CTIX sidebar stuck on CTIX SSR tree | AppFrame nav fetch no longer cancelled by `initialNav` identity |

---

## 23. Commands

```text
npm test -- chat-accuracy     → 452 passed (local)
npm run auth:smoke -- --all   → 4/4
npm run prod:extreme-probe    → 196 PASS
npx tsc --noEmit              → clean
```

---

## 24–25. Canary / deploy

- Staged CLI deploys (Git auto-deploy was often stale): `npx vercel --prod` per project.
- CTIX / CFTR / CSAP / Orchestrate evidence: browser CSRF canaries (auth/401/keys/list) with `retrievalMode: hybrid`.
- Summaries under `artifacts/chat-accuracy/prod-*-auth-canary*.json` (gitignored where present).
- Host-pinned allowlist lets single-product hosts answer docs chat without that product’s Open API connect.

---

## 26. Remaining limitations (prompt not fully closeable without these)

1. **Preview sandbox / npm install / idle→ready FSM** (Phases 36–39) — **not implemented**; cannot be honestly verified.
2. Full Safari UI farm / ~100 live LLM cases per product on all four hosts — not finished.
3. HttpOnly Auth0 cookies block `PROD_CHAT_COOKIE` harness without operator export.
4. Optional: connect CFTR/CSAP/Orchestrate Open API credentials for **live runnable** calls (docs chat no longer requires host-product connect).
5. Redeploy sidebar fix (`445aff7`) on CFTR/CSAP if those hosts still show CTIX SSR nav (Orchestrate already shows correct product nav).

---

## 27. Rollback

Redeploy the previous Vercel production deployment per project, or `git revert` the defective commit and `npx vercel --prod`.

---

## Banner

```text
VERIFIED WITH DOCUMENTED LIMITATIONS
```

Authenticated Ask AI verified on **all four hosts** (CTIX, CFTR, CSAP, Orchestrate) with hybrid retrieval. Build App preview sandbox N/A. Full extreme live LLM volume and Safari UI farm still open.
