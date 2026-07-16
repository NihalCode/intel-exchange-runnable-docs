# Multi-Domain Platform — Phase 0 Implementation Map

**Baseline commit:** `cadc18c` (`main`, 2026-07-16)  
**Prompt:** `polished_latest_code_composer_2_5_multi_domain_prompt.txt`  
**Status:** Phase 0 complete — no broad feature coding started yet.

---

## 1. Quality gate baseline (clean checkout + local artifacts)

| Gate | Result | Notes |
|------|--------|-------|
| `npm run typecheck` | ✅ PASS | |
| `npm test` | ✅ PASS | 95 files, 792 tests |
| `npm run lint` | ✅ PASS | 0 errors, 0 warnings |
| `npm run build` | ✅ PASS | Next.js 16.2.7, 1530 static pages |
| `npm run test:e2e` | ✅ PASS | 13 Playwright tests |
| `npm run security:scan-secrets` | ✅ PASS | 1503 tracked files |
| `npm run archive:check` | ⚠️ FAIL (local) | Expected local-only dirs (`.next/`, `node_modules/`, `.env.local`, etc.) — not a code defect |

Full prompt gate `npm ci` + `--max-warnings=0` lint: lint is clean; `npm ci` not re-run (lockfile matches CI on `main`).

---

## 2. Repeated-login root cause analysis

### Current auth flow (verified in code)

```
Browser → src/proxy.ts → runDocumentationAuthProxy()
  ├─ Public pages/APIs: pass through + merge Auth0 rolling-session headers
  ├─ /api/* (protected): getMiddlewareAuthUser() → 401 JSON if no Auth0 sub
  └─ Pages (protected): redirect /sign-in if no Auth0 sub

RSC layouts (docs, agent, settings, …):
  requireProtectedWorkspace() in protect-layout.ts
  ├─ getAppSessionResult() → needs Auth0 user + invite-only DB user
  ├─ auth0Authenticated, no session → /post-login?returnTo=…
  └─ no Auth0 → /sign-in?returnTo=…

Auth0 callback (auth0.ts onCallback):
  → /post-login?returnTo=<path-only>

post-login/page.tsx:
  ├─ session exists → redirect returnTo
  ├─ accessDenied → /access/*
  ├─ no Auth0 → /sign-in
  └─ Auth0 but no app user → /access/invite-required
```

### Proven contributors to “login again” UX

| # | Cause | Location | Severity |
|---|--------|----------|----------|
| 1 | **Two-layer gate**: middleware = Auth0 `sub` only; app = DB user + invite | `middleware-auth.ts`, `session.ts`, `protect-layout.ts` | Expected; mis-feels like re-login when provisioning pending |
| 2 | **API 401 → sign-in**: client treats any 401 as session expired | `agent-chat-state.tsx` (~601) | Medium — fixed partially via rolling-cookie merge in `proxy-auth.ts` for `/api/*` |
| 3 | **Layout session without Request**: `getAppSessionResult()` in layouts uses cookie-based `auth0.getSession()` (no `NextRequest`) | `protect-layout.ts` | Low risk if SDK reads cookies; verify in prod |
| 4 | **post-login / invite-required loop**: Auth0 OK but user not provisioned → not a credential prompt but blocks workspace | `post-login/page.tsx` | Operational (user admin), not SSO bug |
| 5 | **Path-only `returnTo`**: cannot safely return across origins | `auth0.ts`, `protect-layout.ts`, `proxy-auth.ts` | **Blocks cross-domain SSO** (Phase 7) |
| 6 | **Single `appBaseUrl`**: Auth0 client bound to one origin | `auth0.ts`, `documentation-auth/env.ts` | **Blocks multi-domain** until Phase 7 |
| 7 | **Product from localStorage**: can desync from URL on shared host | `ProductContext.tsx` | Wrong product context, not login loop |

### Phase 6 fix strategy (before cross-domain SSO)

1. Add `resolveWorkspaceSession()` server utility — single call per request tree (Auth0 + app user + org + permissions).
2. Ensure all layout guards use it; avoid duplicate `getAppSessionResult()` races.
3. Client API layer: on `SESSION_EXPIRED`, retry once after cookie refresh before `/sign-in`.
4. Instrument login transactions (started / completed / loop detected) — Phase 23.
5. **Do not remove** layout guards; fix session contract and client retry.

**Cross-domain SSO is a separate problem** (Phase 7); same-origin must be green first.

---

## 3. Product resolution trace

| Layer | File | Behavior today |
|-------|------|----------------|
| Registry | `src/lib/products/registry.ts` | `ctix`, `cftr`, `csap`, `orchestrate` |
| URL parse | `ProductContext.tsx` `productFromPath()` | `/docs/{product}` → productId |
| Fallback | `ProductContext.tsx` | `localStorage` `iedocs.productId` when not on `/docs/{product}` |
| Shell | `AppShell.tsx` | Reads pathname for `/docs/{product}` |
| Sidebar | `Sidebar.tsx` | Links `/docs/{product}/{slug}` |
| Routes | `src/app/docs/[product]/[...slug]/page.tsx` | SSG per product slug |
| Run settings | `RunSettings.tsx` | Per-product credentials in memory |

**Gap for multi-domain:** no host-based resolver; unknown host has no explicit safe failure; CTIX is default product in registry only, not host fallback (good).

---

## 4. AI request & persistence trace

| Step | Module |
|------|--------|
| Turn create | `agent-chat-state.tsx` → `/api/agent/conversations/.../turns` |
| Execute | `/api/agent` → `guardAskAgent()` → `runAgent()` in `orchestrate.ts` |
| Style | `response-style.ts`, `planner.ts`, `llm.ts` |
| Render | `AgentChat.tsx`, `AgentMessageView.tsx` |
| Persist | `005_agent_conversations.ts` — conversations, turns, messages, idempotency, one final message/turn |
| Outcome fields | `AgentResponse`: `fallback`, `citations`, `retrieval`, `retrievalEvidence`, `responseStyle`, `code`, etc. |

**Gap:** no `QueryOutcome` enum or server-side analytics events yet (Phases 11–12).

---

## 5. Snippet / request pipeline trace

| Step | Module |
|------|--------|
| Canonical type | `RunnableRequest` in `types.ts` — `query: KeyValue[]` |
| Build | `snippets.ts` → `buildRunnableRequest()` |
| Resolve | `resolve-request.ts` → creds + overrides |
| Editor | `RequestPlayground.tsx`, `playground-session.ts` (draft in sessionStorage) |
| Run | `runners.tsx` → `/api/run` (`test_snippets` permission) |
| Agent codegen | `codegen.ts` (Java, Go, etc.) |

**Gap:** no `QueryParamSource`, no custom param merge function, no single merge path for all generators (Phases 16–19).

---

## 6. Admin pages still using mock / placeholder data

| Page / component | Mock source |
|------------------|-------------|
| `DocumentationAgentDomainsPage.tsx` | `PLACEHOLDER_NOTICE` only — **must become real in Phase 20** |
| `DocumentationAgentSourcesPage.tsx` | `MOCK_DOC_SOURCES` |
| `DocumentationAgentWebhooksPage.tsx` | `MOCK_WEBHOOKS` |
| `DocumentationAgentOverviewPage.tsx` | `PLACEHOLDER_NOTICE` |
| `RateLimitsPage.tsx` | `MOCK_RATE_LIMITS` |
| `SecurityPages.tsx` | `MOCK_ROLES`, `MOCK_SERVICE_ACCOUNTS` |
| `SupportAgentOverviewPage.tsx` + `SupportAgentPages.tsx` | Multiple mocks — **stay fail-closed / default-off** |

New domain + query analytics pages **must not** import `src/lib/admin/mock-data.ts`.

---

## 7. Schema migration plan (Phase 2 → migration `006`)

Next file: `src/lib/db/migrations/006_multi_domain_analytics.ts` (name TBD).

**Tables:**

- `domain_collection_mappings` — tenant-owned, unique normalized hostname, verification/TLS, version, audit columns
- `query_analytics_events` — org, user, turn, outcome, product, hostname, latency, safe metadata (no full prompt by default)
- `unanswered_query_reviews` — workflow on analytics events
- `saved_snippet_custom_params` — optional; only if server persistence enabled (default: client draft only per Phase 17)

**PostgreSQL:** RLS + `app.organization_id` policies matching `004_documentation_platform.ts` pattern.

**SQLite:** same columns for dev/CI.

---

## 8. Feature flag plan (Phase 21)

Add to `src/lib/documentation-features/keys.ts`:

| Key | Default prod | Purpose |
|-----|--------------|---------|
| `host_based_product_routing` | OFF | Host resolver + rewrites |
| `separate_admin_domain` | OFF | Admin origin routing |
| `cross_domain_sso` | OFF | Cross-origin login transactions |
| `query_analytics` | OFF | Server metrics |
| `unanswered_query_review` | OFF | Review workflow |
| `chat_response_navigation` | OFF | Jump links in long answers |
| `custom_snippet_query_parameters` | OFF | Custom query param UI |

No `NEXT_PUBLIC_*` for authorization decisions.

---

## 9. Deployment / domain plan (config-driven)

**Env vars (names only — values per tenant):**

- `CTIX_DOMAIN`, `CFTR_DOMAIN`, `CSAP_DOMAIN`, `ORCHESTRATE_DOMAIN`
- `ADMIN_DOMAIN`, `AUTH_DOMAIN` (optional central auth)
- `APP_BASE_URL` (existing — primary Auth0 callback origin until Phase 7)
- `TRUSTED_PROXY_HEADERS` / platform trust model for `x-forwarded-host`

**Rollout:** Staged per Phase 26 (shadow resolver → staging domains → one product canary → admin domain → analytics → custom params).

**Rollback:** disable flags → shared `/docs/{product}` routing → same-origin admin.

---

## 10. File-by-file implementation plan (phases 1–26 summary)

| Phase | Primary deliverables |
|-------|---------------------|
| 1 | `src/lib/domains/{types,normalize,repository,resolver,urls}.ts` |
| 2 | Migration `006_*`, repository CRUD + optimistic concurrency |
| 3 | Trusted host resolver in `proxy.ts` / internal headers (overwrite only) |
| 4 | Rewrites: `/{docs,guides,agent,...}` on product domains → `/docs/{product}/...` |
| 5 | Admin origin rewrite; product domains block `/admin`; nav uses `urls.ts` |
| 6 | `resolveWorkspaceSession()`; client 401 retry; login instrumentation |
| 7 | Cross-origin return targets; auth transaction store; Mode 1/2 topology |
| 8 | Extend `DocumentationPermission` + `ENTERPRISE_PERMISSIONS`; route guards |
| 9 | `ProductProvider` initial server context; dedicated domain overrides localStorage |
| 10 | Scope `/api/docs/search`, `/api/agent`, citations, retrieval by host |
| 11 | `query-outcome.ts` classifier (unit tested) |
| 12 | Analytics writer integrated with turn completion + idempotency |
| 13–14 | Admin query analytics + unanswered review pages (real data) |
| 15 | `AgentMessageView` navigation aids (preserve response-style) |
| 16–19 | `RequestQueryParam`, merge function, editor UI, snippet/run parity |
| 20 | Domain management UI (replace placeholder domains page) |
| 21 | Feature flags |
| 22 | Legacy redirects map |
| 23 | Observability events |
| 24–25 | Unit + Playwright suites listed in prompt |
| 26 | Staged deploy + smoke |

---

## 11. RBAC extensions (Phase 8 preview)

**New enterprise permissions** (add to `ENTERPRISE_PERMISSIONS`):

- `domains.read`, `domains.manage`
- `collections.read`, `collections.manage`
- `query_analytics.read`, `query_analytics.read_sensitive`
- `unanswered_queries.manage`

**Mapping:**

- Owner / Admin → all new permissions
- Developer → read-only domain/collection/analytics aggregate; no sensitive prompts; no domain mutation
- Documentation manager / Viewer → no admin-domain permissions (unchanged)

**Route guards to add:**

- `/settings/users` → `manage_users` (API already guarded; layout currently only `requireProtectedWorkspace`)
- `/settings/content` → `sync_docs` or `manage_sources`
- `/developer` → `view_technical_diagnostics`
- `/api/run` → already `test_snippets`

---

## 12. Rollback plan

1. Set all new feature flags OFF in Vercel.
2. Remove host rewrites from deployment config (or flag-gated no-ops).
3. Keep migration tables (no data loss).
4. Admin remains reachable at `/admin` on primary origin.
5. Custom query param UI hidden; documented + auth params unchanged.

---

## 13. Phase 0 verdict

**NOT READY** for staged multi-domain rollout (expected — implementation not started).

**Ready to begin Phase 1** after review:

- Baseline gates green (except local `archive:check`).
- Repeated-login causes documented; Phase 6 must land before Phase 7.
- Mock admin surfaces identified.
- Migration and flag plans defined.

---

## 14. Recommended next commit

```
docs(enterprise): add Phase 0 multi-domain implementation map
```

Then Phase 1: domain types + normalize + repository skeleton (no routing changes).
