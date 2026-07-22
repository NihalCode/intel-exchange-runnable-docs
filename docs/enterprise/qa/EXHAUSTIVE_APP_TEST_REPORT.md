# Exhaustive App Test Report

**Date:** 2026-07-21 (local) / 2026-07-22 UTC  
**Branch:** `ui/structural-cyware-replica` @ `18728b5`  
**Verdict:** see final line  

---

## 1. Runtime matrix

```ts
RuntimeTestTarget = {
  environment: "local",
  product: "ctix" /* DEFAULT_PRODUCT_ID; all four docs products available */,
  hostname: "localhost:3000",
  commitSha: "18728b5",
  appProductId: null, // host-based product routing OFF
  organizationId: "07202d67-14e2-4dd9-a160-1d2ba9d72bdb", // Default Organization
  enabledFeatures: [
    "ai_documentation_assistant",
    "require_product_credentials_for_agent",
    "generated_code_examples",
    "public_changelog",
    "public_documentation_search",
    "query_analytics", // effectiveEnabled=true (env/auto)
    "unanswered_query_review", // effectiveEnabled=true (env)
    "unanswered_query_realtime_summary", // effectiveEnabled=true (env)
    "production_query_metrics",
    "enterprise_ui_v2",
  ],
  authReady: false, // /api/health/auth 503 — Auth0 env incomplete (expected under AUTH_DISABLED)
  databaseReady: true, // local sqlite documentation-auth.db; /api/health/ready also flags AUTH_DATABASE_NOT_CONFIGURED for postgres
  retrievalReady: true, // openai + pinecone configured; hybrid_ok
  analyticsReady: true, // QUERY_ANALYTICS_ENABLED; recording confirmed
  recaptchaReady: false, // recaptcha_protection effectiveEnabled=false
};
```

| Probe | Result |
|---|---|
| `GET /api/health/live` | 200 `ok` |
| `GET /api/health/ready` | 503 degraded (Auth0 env incomplete; no postgres `DATABASE_URL`) |
| `GET /api/health/retrieval` | 200 ready (`hybrid_ok`) |
| `GET /api/health/auth` | 503 (Auth0 incomplete) |
| `GET /api/auth/me` | Local Developer owner (`AUTH_DISABLED=true`) |
| Auth0 live sessions | **NOT EXERCISED** — local uses AUTH_DISABLED |

Env flags (names only): `AUTH_DISABLED=true`, `QUERY_ANALYTICS_ENABLED=true`, `UNANSWERED_QUERY_REVIEW_ENABLED=true`, `UNANSWERED_QUERY_REALTIME_SUMMARY_ENABLED=true`, `DEFAULT_PRODUCT_ID=ctix`, live API UI + execution enabled. Secrets not recorded.

---

## 2. Complete route inventory

**Page routes discovered under `src/app`:** 60 `page.tsx` files.  
**API routes:** 67 `route.ts` handlers (including newly added unanswered list).

### HTTP smoke crawl (Local Developer / AUTH_DISABLED)

| Status | Routes |
|---|---|
| 200 | `/`, `/agent`, `/authentication`, `/developer`, `/guides`, `/changelog`, `/invite`, access/* pages, all listed `/admin/**` pages in crawl set |
| 307 | `/settings` → `/settings/users`; `/sign-in`, `/post-login`; `/docs/{ctix,cftr,csap,orchestrate}` → product hub/reference |
| Non-2xx in crawl | **None** for the 60-route smoke set |

Deep links followed with `-L`: all four product docs hubs return 200.

---

## 3. Complete tab/control inventory

| Surface | Controls exercised | Status |
|---|---|---|
| Primary nav | Home, Guides, Changelog, Authentication, Ask AI, Search, product selector, theme | PASS (load + smoke) |
| Product hub | CTIX/CSAP/Orchestrate/CFTR cards | PASS |
| Admin nav (capability+feature filtered) | Dashboard, Schemas, Users, Auth, Features, Environments, Change Requests, Audit Logs, Settings, APIs, Sync Jobs, API Keys, Domains, Query analytics, Unanswered, Logs; Shared + Security Settings | PASS (HTTP + browser for key pages) |
| Feature-hidden admin | Deployments, Sources, Webhooks, Support Agent*, Rate Limits, Roles, Service Accounts, Unanswered weekly (nav) | CORRECTLY HIDDEN when flags off |
| Ask AI | New chat, product scope, send, sources, API details | PASS |
| Authentication | Product picker, base URL / Access ID / Secret Key form (no secret values recorded) | PASS (UI load) |
| Query analytics | Date range, product filter, metrics, recent events, CSV links | PASS |
| Unanswered | SSR list + summary poll API | PASS after list API fix |
| Weekly unanswered | Soft-disabled banner when flag off | PASS after fix |
| Domains | Routing-disabled banner | PASS (prior fix retained) |
| Build App / project workspace | Feature flags off — UI gated | NOT LIVE-EXERCISED (flag OFF) |
| Support Agent modules | Flag OFF — HTTP pages still 200 (placeholder) | PARTIAL |

---

## 4. Role matrix

| Role / state | Live browser | Automated tests | Notes |
|---|---|---|---|
| Unauthenticated | NOT EXERCISED live (AUTH_DISABLED always session) | PASS (`admin-access`, middleware/proxy tests) | |
| Local Developer / Owner | PASS | PASS | Default AUTH_DISABLED principal |
| Viewer | NOT EXERCISED live | PASS (enterprise matrix, feedback/ask gates) | Use `x-test-role` in unit tests |
| Developer | NOT EXERCISED live | PASS (enterprise matrix; sensitive analytics deny) | |
| Documentation Manager | NOT EXERCISED live | PASS (matrix + nav deny) | |
| Admin | NOT EXERCISED live | PASS (enterprise matrix) | |
| Disabled / invite expired / wrong-email | Access pages 200 | PASS (documentation-auth invite tests) | UI pages smoke only |
| Auth0 Viewer/Admin/Owner sessions | **NOT EXERCISED** | N/A live | No live Auth0 minting locally |

---

## 5. Feature-flag matrix

| Feature | Effective | Live exercise |
|---|---|---|
| `query_analytics` | ON (env/auto) | PASS — records + admin UI |
| `unanswered_query_review` | ON (env) | PASS — list + review queue |
| `unanswered_query_realtime_summary` | ON | PASS — summary API |
| `unanswered_query_weekly_analytics` | OFF | PASS — soft banner + API 403; nav hidden |
| `app_builder` / `project_workspace` / `preview` / `vercel_*` / `git_commit` | OFF | NOT LIVE-EXERCISED |
| `support_agent` | OFF | Placeholder pages HTTP 200; nav hidden |
| `placeholder_admin_modules` | OFF | Nav hidden |
| `admin_deployment_management` | OFF | Nav hidden |
| `host_based_product_routing` | OFF | Domains page soft banner PASS |
| `recaptcha_protection` | OFF | NOT EXERCISED |
| `viewer_ask_ai_access_enabled` | OFF | Unit-covered only |
| Toggle via Features admin UI | NOT FULLY EXERCISED | Features page 200; enable/disable mutations not mutated in this run |

---

## 6. Product matrix

| Product | Docs hub | Ask AI productId | Auth form |
|---|---|---|---|
| CTIX | PASS | PASS (primary) | PASS UI |
| CFTR | PASS (HTTP 200) | NOT LIVE-EXERCISED (chat) | PASS UI option |
| CSAP | PASS (HTTP 200) | NOT LIVE-EXERCISED (chat) | PASS UI option |
| Orchestrate | PASS (HTTP 200) | NOT LIVE-EXERCISED (chat) | PASS UI option |
| Admin | PASS | N/A | N/A |

`/api/agent/status` reported credentialedProducts: ctix, csap, orchestrate, cftr (dev env keys configured; secrets not logged).

---

## 7–11. Navigation / Home / Docs / Search / API reference

| Area | Status | Evidence |
|---|---|---|
| Navigation | PASS | Browser + HTTP crawl |
| Home / product hub | PASS | Browser snapshot |
| Documentation CTIX reference | PASS | `/docs/ctix/intel-exchange-api-reference` |
| Docs search API | PASS | `/api/docs/search?q=tags&productId=ctix` |
| Runnable snippet live Run | NOT EXERCISED | Prefer not to hit live tenant mutating calls without explicit canary approval |
| Guides / Changelog | PASS (HTTP 200) | Smoke |

---

## 12. Authentication / credentials

| Check | Status |
|---|---|
| Authentication page loads | PASS |
| Secret Key field present (masked input) | PASS |
| Credentials never stored server-side (copy claims) | Documented; not re-proven beyond UI copy |
| Live Test & connect to tenant | NOT EXERCISED (avoid logging secrets / tenant noise) |

---

## 13–15. Ask AI / Conversations / Feedback

| Check | Status | Evidence |
|---|---|---|
| Browser Ask AI create-tag question | PASS | Answer cited Create Tags + Get Tags List |
| API POST `/api/agent` | PASS | 200; analytics increment |
| Analytics recording | PASS | logical queries 4→6 during session; unanswered=1 |
| Conversation list / New | PASS (UI) | |
| Feedback thumbs | NOT EXERCISED | `chat_feedback` effective OFF |
| Chat duplicates | NOT OBSERVED | Single-turn checks only |

---

## 16–18. Unanswered / Weekly / Query Analytics

| Check | Status |
|---|---|
| Query Analytics UI metrics + events | PASS |
| Unanswered SSR page | PASS |
| Unanswered list API | **FIXED** — was 404; now 200 `{ rows }` |
| Unanswered summary API | PASS |
| Weekly API when flag OFF | 403 FEATURE_DISABLED (correct) |
| Weekly page when flag OFF | **FIXED** — was hard `notFound`; now soft banner |
| Weekly deep link from unanswered | **FIXED** — link gated on feature |

---

## 19–21. Build App / Developer / Users

| Area | Status |
|---|---|
| Build App | NOT EXERCISED — `app_builder` OFF |
| Developer console | PASS (HTTP 200) |
| Users admin / settings users | PASS (HTTP 200) |
| Invite / resend / revoke mutations | NOT EXERCISED live |

---

## 22–32. Content / Features / Keys / Deployments / Domains / Env / Changes / Audit / Security / Jobs / Support

| Area | Status |
|---|---|
| Domains | PASS soft-disable banner |
| Features page | PASS smoke |
| Schemas / APIs / Sync Jobs / Keys / Environments / Change Requests / Audit Logs / Settings | PASS HTTP smoke |
| Deployments (flag off) | HTTP 200 page exists; nav hidden |
| Support Agent tree | HTTP 200 placeholders; nav hidden; **placeholder live data** not claimed verified |
| Rate limits / Roles / Service accounts | HTTP 200; feature-gated nav |
| Jobs processor / webhooks live fire | NOT EXERCISED |
| Production repair / canaries | **NOT RUN** (requires approval) |

---

## 33–41. Concurrency / Deep-link / Responsive / A11y / Visual / Perf / Security / Data integrity / Failure injection

| Area | Status |
|---|---|
| Multi-tab concurrency | NOT EXERCISED |
| Deep links | PARTIAL — weekly soft-gate fixed; docs redirects OK |
| Responsive / mobile drawer | NOT SYSTEMATICALLY EXERCISED |
| Keyboard / SR a11y | PARTIAL — skip links + aria labels observed; no axe audit |
| Visual fidelity | PARTIAL — Frame naming preserved (`AdminFrame`/`AppFrame`); `cx-admin-shell` is CSS layout token (asserted by structural tests), not component rename |
| Performance | NOT BENCHMARKED |
| Security | PARTIAL — no secret leakage in this report; SSRF/proxy covered by existing tests |
| Data integrity analytics | PASS recording; reconcile/repair scripts NOT RUN |
| Failure injection | NOT EXERCISED |

---

## 42–45. Defects / root causes / files / tests

### Defects found and fixed

| Sev | Defect | Root cause | Fix | Test |
|---|---|---|---|---|
| High (workflow) | `GET /api/admin/unanswered-queries` returned 404 | List route never existed (only summary/weekly/[id]) | Added `src/app/api/admin/unanswered-queries/route.ts` with permission + feature gate; no raw query/IP | `unanswered-admin-surfaces.test.ts` |
| Med (UX / deep-link) | Weekly page hard-404 when flag off; unanswered page always linked to it | `requireAdminFeature` → `notFound()`; ungated Link | Soft banner + `weeklyEnabled`; gate Link on `enabledFeatures` | same test file |

### Prior recent fixes verified (not re-broken)

- Query Analytics records under AUTH_DISABLED
- Domains no hard-404 when host routing off
- Admin brand `text-white` on CYWARE \| Admin

### Observed non-blocking

- Next.js DevTools overlay referencing `RootLayout` Script in `<head>` (pre-existing pattern)
- Admin a11y tree sometimes duplicates regions (SSR + client)
- `/api/health/ready` and `/api/health/auth` 503 under AUTH_DISABLED without Auth0/postgres — expected for this local matrix

---

## 46. Exact command results

| Command | Result |
|---|---|
| `npm test` | **PASS** — 141 files, 1350 tests |
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npm run lint` | **PASS** (exit 0) |
| `npm run build` | **PASS** (exit 0) |
| `npm run test:e2e` | **NOT RUN** |
| `npm run prod:chat-harness` / `prod:extreme-probe` | **NOT RUN** (production) |
| `npm run local:product-canary` | **NOT RUN** |
| `npm run analytics:reconcile` / repair | **NOT RUN** |
| `npm run security:scan-secrets` / health scripts | **NOT RUN** this pass |

---

## 47–51. Product / admin canaries

| Canary | Status |
|---|---|
| CTIX production canary | **NOT RUN** |
| CFTR production canary | **NOT RUN** |
| CSAP production canary | **NOT RUN** |
| Orchestrate production canary | **NOT RUN** |
| Admin production canary | **NOT RUN** |
| Local product smoke (docs + Ask AI CTIX) | PASS with limitations |

---

## 52. Remaining limitations

1. AUTH_DISABLED Local Developer only — no live Auth0 Viewer/Admin/Owner browser matrix.
2. Build App / Vercel / git / preview / Support Agent live workflows not exercised (flags off or placeholder).
3. No production canaries, e2e Playwright suite, or analytics reconcile.
4. CFTR/CSAP/Orchestrate Ask AI turns not deeply exercised (docs hubs smoke only).
5. Feature flag toggle mutations on Features page not flipped end-to-end.
6. Mobile/keyboard/a11y not systematically audited.
7. Live snippet Run against tenant not executed in this pass.

---

## 53. Accepted risks

| Risk | Owner | Expiry |
|---|---|---|
| Local AUTH_DISABLED bypasses real Auth0 readiness | Engineering | Until Auth0 env validated on a non-local target |
| Weekly analytics remains OFF until explicitly enabled | Product/Admin | Until feature flag enabled |
| Support Agent placeholder modules reachable by URL when flag off | Engineering | Until route-level feature hard-gate if required |

---

## 54. Rollback

No deploy performed. Local code fixes are additive (new route + soft-gate). Revert:

- `src/app/api/admin/unanswered-queries/route.ts`
- weekly page / `UnansweredWeeklyPage` / `UnansweredQueriesPage` edits
- `src/lib/__tests__/unanswered-admin-surfaces.test.ts`

---

## 55. Evidence table (sample)

| Role | Product | Route/Tab | Workflow | Status | Failure | Root Cause | Fix | Evidence |
|---|---|---|---|---|---|---|---|---|
| Owner (local) | ctix | /agent | Ask create tag | PASS | — | — | — | Browser answer + sources |
| Owner (local) | ctix | /api/agent | POST plan | PASS | — | — | — | HTTP 200; analytics++ |
| Owner (local) | admin | Query analytics | View metrics | PASS | — | — | — | 6 logical / 1 unanswered |
| Owner (local) | admin | Unanswered list API | GET list | PASS (fixed) | was 404 | missing route | added route | HTTP 200 rows |
| Owner (local) | admin | Weekly page | Flag off UX | PASS (fixed) | was notFound | requireAdminFeature | soft banner | banner visible |
| Owner (local) | admin | Domains | Routing off | PASS | — | — | prior | banner visible |
| Viewer | * | * | Live browser | NOT EXERCISED | — | AUTH_DISABLED | unit matrix | tests |
| * | * | prod canary | * | NOT RUN | — | policy | — | — |

---

```text
VERIFIED WITH DOCUMENTED LIMITATIONS
```
