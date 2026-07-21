# Production AI Chat + Build App — FINAL REPORT

**Date:** 2026-07-21  
**Baseline:** `3fc9e04`  
**Key commits:** `2a90906` (harness) · `6db046d` (auth how-to) · `fa1f546` (Build App guard) · `f82c4d4` (HTTP 401/4xx) · (this commit: suite expansion + retrieval health)  
**Readiness banner:** `VERIFIED WITH DOCUMENTED LIMITATIONS`

Do **not** claim `ALL FOUR PRODUCTION CHAT PRODUCTS VERIFIED` — authenticated LLM scoring is complete for CTIX only; CFTR/CSAP/Orchestrate Ask AI requires those products connected at `/authentication`; in-product preview sandbox does not exist.

---

## 1. Production deployment matrix

See [prod-chat-build-matrix.md](../prod-chat-build-matrix.md).

| Product | Canonical host | authReady | Authenticated chat canary |
|---|---|---|---|
| CTIX | `apitest1.cyninjadev.com` | true | **PASS** (25 curated cases; 23/25 then 401/keys fixes) |
| CFTR | `cyware-docs-cftr.vercel.app` | true | **BLOCKED** — session OK, product credentials not connected |
| CSAP | `cyware-docs-csap.vercel.app` | true | **BLOCKED** — awaiting connect + canary |
| Orchestrate | `cyware-docs-orchestrate.vercel.app` | true | **BLOCKED** — awaiting connect + canary |

Infra probes: `auth:smoke --all` 4/4 · `prod:extreme-probe` 196/196 PASS.

---

## 2. Test harness summary

| Harness | Result |
|---|---|
| `npm test -- chat-accuracy` | **452 passed** |
| Manifest suites | **360 cases × 4 products** (category floors: endpoint≥50, auth≥30, snippet≥50, unsupported≥30, typo≥30, adversarial≥20, troubleshooting≥30, pagination≥20) |
| Build App suite | **31 cases × 4 products** (≥30 Phase 31 floor) |
| Multiturn suite | Expanded (`multiturn-suite.json` + tests) |
| Prod chat harness (`PROD_CHAT_*`) | Scaffold exists; cookie-env still blocked (HttpOnly Auth0) |
| Browser canary | CTIX PASS via in-page CSRF + `/api/agent` |
| Retrieval health | `/api/health/retrieval` + `getRetrievalHealthStatus()` (no secrets) |

---

## 3. Golden / manifest

- `artifacts/chat-accuracy/api-manifest.json` — 639 endpoints + `contentHash`
- Generated suites meet extreme category floors without inventing endpoints
- Freshness meta: `manifest-suites-meta.json`

---

## 4–18. Chat accuracy (local BM25 + rule enforcers)

Deterministic suites cover product scope, auth (AccessID/Signature/Expires), 401/429, snippets, no-invent, adversarial, multiturn, citations, degraded mode, idempotency, Build App intent collision.

Production OpenAI+Pinecone path: often `retrievalDegraded` / `degraded_lexical` on CTIX — hybrid requires `OPENAI_API_KEY` + `PINECONE_API_KEY` + matching `PINECONE_INDEX` / `VECTOR_NAMESPACE=product-{id}` and `npm run pinecone:upsert`. Index name aligned to `intel-exchange-docs` in `.env.example`.

---

## 19–22. Defects fixed this program

| Issue | Fix |
|---|---|
| Auth how-to abstention (`authentication` slug) | `enforceOpenApiAuthPlan` |
| Build App opaque 500 | Inline `app_builder` flag check (no double `guardAskAgent`) |
| HTTP 401 invents auth endpoint | `enforceHttpStatusGuidancePlan` |
| Separate-keys phrasing weak | Stronger `isCredentialsQuery` + “own separate” copy |
| Suite volume below prompt floors | Generator quotas → 360/product |
| Build App &lt;30/product | Expanded to 31/product |
| Pinecone failure opaque | `reasonCode` on query + retrieval health endpoint |

---

## 23. Commands

```text
npm test -- chat-accuracy     → 452 passed
npm run auth:smoke -- --all   → 4/4
npm run prod:extreme-probe    → 196 PASS
npx tsc --noEmit              → clean
```

---

## 24–25. Canary / deploy

- Staged CLI deploys (Git auto-deploy was stale): CTIX first, then CFTR → CSAP → Orchestrate.
- CTIX authenticated canary evidence: `artifacts/chat-accuracy/prod-ctix-auth-canary.json` (redacted).
- CFTR: Auth0+MFA OK; Ask AI returns “Not connected: CFTR” until `/authentication` Test & connect for CFTR.

---

## 26. Remaining limitations (prompt not fully closeable without these)

1. **Connect CFTR / CSAP / Orchestrate** Open API credentials at each host’s `/authentication` (operator action).
2. **Pinecone/OpenAI env** per Vercel project + upsert into `product-*` namespaces (operator action).
3. **Preview sandbox / npm install / idle→ready FSM** (Phases 36–39) — **not implemented** in product architecture; cannot be honestly verified.
4. Full Safari UI farm / ~100 live LLM cases per product on all four hosts — not finished.
5. HttpOnly Auth0 cookies block `PROD_CHAT_COOKIE` harness without operator export.

---

## 27. Rollback

```bash
git revert <sha>
# redeploy each cyware-docs-{ctix,cftr,csap,orchestrate} project
```

---

## 28–50. Build App

| Area | Status |
|---|---|
| Architecture inventory | [BUILD_APP_ARCHITECTURE.md](./BUILD_APP_ARCHITECTURE.md) |
| Intent collision | PASS |
| Blueprint ≥30/product | PASS (31×4) |
| validate / no SecretKey / no `..` | PASS |
| Zip/deploy/commit unit coverage | Existing tests + flags |
| Preview/sandbox exploit | **N/A — not built** |
| CTIX Build App prod canary | PASS (10 files) |
| CFTR/CSAP/Orchestrate Build App prod | BLOCKED on product connect |

---

```text
VERIFIED WITH DOCUMENTED LIMITATIONS
```
