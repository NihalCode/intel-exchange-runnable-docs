# Ultimate Niche-Aspect End-to-End Validation Report

**Date:** 2026-07-15
**Author:** Ultimate niche-aspect exhaustive enterprise validation pass
**Repository:** `intel-exchange-runnable-docs`
**Prompt:** `ultimate_niche_aspect_end_to_end_validation_prompt.txt` (40-section exhaustive enterprise validation)
**Environments:** local clean workspace (Windows / PowerShell 5.1, Node v24.13.0) + production (Vercel)

---

## 1. Executive summary

This is the **ultimate niche-aspect** validation pass — the deepest, most adversarial gate
before demo. It re-runs every local release gate from source, exercises negative paths, edge
cases, permission boundaries, connector states, AI-response modes, and security controls, and
classifies every inventory item with an honest status backed by evidence. No item is marked
PASS on the basis of a page loading, a button existing, a mock response, a "Connected" badge,
a route definition, or a local-only screenshot.

### Verdict: **READY WITH DOCUMENTED LIMITATIONS**

- **All local release gates are green** on `main @ 340a969` (fresh runs this pass):
  typecheck (0 errors), lint (`0 errors / 0 warnings`), **753 unit tests / 91 files**,
  production build (~530 SSG pages, no route errors), **13/13 Playwright e2e**, secret scan
  clean (1485 files / 25 patterns / 0 matches). No `.only` / `.skip` / `.todo` suppression
  exists anywhere under `src/`.
- **Production (`https://intel-exchange-runnable-docs.vercel.app`) is Auth0-gated** and
  confirmed non-public: `/`, `/agent`, `/admin`, `/docs/ctix` all `307 → /sign-in?returnTo=…`.
  This is by design; "public docs" is therefore **DISABLED BY DESIGN**, not a defect.
- **No demo-blocking FAIL was found.** Consequently **no durable code fixes were required**
  this pass — consistent with the mandate to fix only *verified* blockers and never fabricate
  changes or force-merge unreviewed branches. The fix-and-rerun loop (§38) ran as a no-op.
- **Unauthenticated mutating API calls are correctly rejected** — `POST` to
  `/api/admin/control-plane/context`, `/api/admin/audit`, `/api/agent`, `/api/run`,
  `/api/users` each return `401` on prod with no data or existence leak.
- **Support Agent / Zendesk, generated-app, connector-sync, and live API execution are
  fail-closed / disabled by default** — classified **DISABLED BY DESIGN**, verified in the
  feature-flag source and fail-closed tests (no fabricated connector health, no mock tickets).
- **The security/health-score work remains branch-only** (`security/health-score-remediation`,
  based on the older `5083b3e`, **not merged, not on prod**). Its global CSP + code-health
  analyzer are classified **PASS WITH LIMITATIONS (not on prod)** and were **not** force-merged.

### Honesty caveats (what this pass could and could not do)

- Production is Auth0-gated and **no test-tenant credentials were available**, so authenticated
  production workflows (admin CRUD writes, live change-management deploy, live API-runner
  execution, live LLM/Pinecone answers, live Zendesk sync) were validated via **source review +
  local automated suites + unauthenticated production HTTP smoke**, not via live authenticated
  clicking. Each such item is explicitly marked **PASS WITH LIMITATIONS** rather than PASS.
- The Vitest/e2e suites run against the **deterministic BM25 + rule-based planner fallback**
  (no `OPENAI_API_KEY` / `PINECONE_API_KEY` in the test env), matching the documented design.
  Genuinely novel phrasings only a live LLM would handle are not exercised here.
- No dedicated SAST, SBOM, license-scanner, load-test, screen-reader, or chaos-injection tooling
  is wired into this repo. Those §33–§36 aspects are assessed by **source review + design
  analysis** and are marked **PASS WITH LIMITATIONS** or **NOT APPLICABLE** accordingly, never
  fabricated as PASS.

---

## 2. Exact release baseline (Phase 0/2)

| Item | Value |
|---|---|
| Environment | local clean (Windows / PowerShell 5.1) + production (Vercel) |
| Branch tested | `main` |
| Commit SHA (`main` == `origin/main`) | `340a969f7a70add46f08b96504fefbe1210de421` (in sync) |
| Production URL | `https://intel-exchange-runnable-docs.vercel.app` |
| Prior recorded prod deployment ID | `dpl_3UwQdZ2j8L4SEAD7r4crGY5ZPwUJ` (see §25 for this pass) |
| Prod health | `/api/health/live` → 200; `/api/health/ready` → `{"status":"ready","checks":{"database":true,"authConfig":true}}` |
| Node / npm | v24.13.0 / 11.6.2 |
| Framework | Next.js 16.2.7, React 19.2.4, TypeScript 5.x |
| Package manager | npm (lockfile committed) |
| DB schema version | migrations `001`–`005` present under `src/lib/db/migrations` |
| Feature-flag defaults | see §"Feature-flag state" below |
| Security branch (NOT merged) | `security/health-score-remediation` (merge-base `5083b3e`) |
| `340a969` ancestor of security branch? | **No** — branch predates the strict-chat work |

### Release gate results (fresh runs this pass, `main @ 340a969`)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** — 0 errors |
| Lint | `npm run lint` (`eslint`) | **PASS** — 0 errors, 0 warnings |
| Unit tests | `npm test` (`vitest run`) | **PASS** — 91 files / **753 tests**, 0 failures |
| Production build | `npm run build` | **PASS** — ~530 pages SSG, no route errors |
| E2E | `npm run test:e2e` (Playwright) | **PASS** — 13/13 |
| Secret scan | `npm run security:scan-secrets` | **PASS** — 1485 files, 25 patterns, 0 matches |
| Test-suppression audit | grep `.only`/`.skip`/`.todo` under `src` | **PASS** — none found |

> `npm ci` from a fully clean checkout was **not** re-run this pass (existing `node_modules`
> reused) to avoid the documented Windows `better-sqlite3` lockfile/native-rebuild risk. All
> gates above ran against the committed source at `340a969`. This is disclosed, not hidden.

### E2E environment observation (not a prod defect)

The e2e web server logs `Error: A CSRF signing secret of at least 32 characters is required`
from `src/lib/enterprise/csrf.ts:18` when `/api/admin/control-plane/context` is hit without
`AUTH_SECRET` set. This is **fail-loud secure behavior** — it throws rather than falling back to
an insecure default — and did **not** fail the 13/13 e2e run. Production sets `AUTH_SECRET`
(prod `/api/health/ready` reports `authConfig: true`). Classified as an accepted env-config note.

### Feature-flag state (`src/lib/documentation-features/keys.ts`)

`DEFAULT_ENABLED` = `ai_documentation_assistant`, `generated_code_examples`, `public_changelog`,
`public_documentation_search`. **Disabled by default:** `app_builder`, `project_workspace`,
`preview`, `vercel_deployment`, `git_commit`, `project_download`, `vercel_import`,
`api_testing_console`, `support_agent`, `placeholder_admin_modules`. Live API execution is
additionally gated by `ENABLE_API_EXECUTION !== "true"` in `src/app/api/run/route.ts`.

---

## 3. System inventory (Phase 1)

Full route/module inventory is maintained in `docs/enterprise/phase-0/FEATURE_INVENTORY.md`
and `ROUTE_ACCESS_MATRIX.md`. Verified counts this pass from `src/app`:

| Category | Count / examples | Notes |
|---|---|---|
| A. Public routes | `/`, `/sign-in`, `/access/*`, `/invite` | all Auth0-gated on prod except sign-in/access |
| B. Authenticated user routes | `/agent`, `/docs/*`, `/authentication`, `/settings/*`, `/changelog`, `/guides` | require session |
| C. Developer routes | `/developer` | environment-limited |
| D. Admin routes | `/admin/*` (documentation-agent, support-agent, security, environments, rate-limits, audit-logs, change-requests) — ~40 pages | permission-gated + `noindex` headers |
| E. API routes | 52 `route.ts` handlers under `src/app/api/**` | all guarded (`guardDocumentationApi` / `guardEnterpriseApi`) |
| F. Server actions | admin server-context loaders | org-scoped |
| G. WS/SSE | agent turn streaming (`/api/agent/conversations/[id]/turns`) | SSE-style event stream |
| H./I. Background/scheduled jobs | `control-plane/jobs`, `jobs/process`, `job-processor.ts` | tenant-scoped, idempotent |
| J. Webhook handlers | admin webhook config (documentation-agent + support-agent) | signing/verify code present; delivery engine gated |
| K. DB tables | migrations `001`–`005` (auth, enterprise control plane, security settings, documentation platform, agent conversations) | RLS/org-scoping in repository layer |
| L./M. Vector / search indexes | Pinecone serverless (server-side) + local BM25 `agent-index.json` fallback | fallback deterministic |
| N. Secret providers | Auth0, env vars, `vault.ts` / `vault-providers.ts` | memory-only creds per design |
| O. External providers | Auth0, OpenAI, Pinecone, Vercel, (Zendesk — disabled) | |
| P. Feature flags | 14 documentation-feature keys (§2) | 4 enabled by default |
| Q./R. AI tools / prompts | orchestrate planner, intent, retrieval, response-style, safety | rule-based enforcers |
| S. Generated-app functions | app-builder, edit-app, workspace-client | **disabled by default** |
| T. Upload/import paths | `/api/agent/zip`, multipart in `/api/run`, postman import | size caps, archive checks |
| U. Export/download paths | `control-plane/export`, `developer/postman` | permission-gated |
| V. Monitoring/audit | `audit.ts`, `observability.ts`, `/api/health/*` | request/trace IDs |

Status legend: **PASS** · **PASS-LIM** (pass with documented limitations) · **BLOCKED** ·
**FAIL** · **DISABLED** (by design) · **NOT-IMPL** · **N/A**.

---

## 4. Feature status matrix

| Area | Feature | Status | Environment | Evidence | Limitation | Owner |
|---|---|---|---|---|---|---|
| Public docs | Unauthenticated public docs | DISABLED | prod | `/docs/ctix` → 307 `/sign-in`; app is Auth0-gated by design | Intentional gating | Product |
| Public docs | Doc page render / nav / SSG | PASS | build | build renders ~530 pages; `/docs/[...slug]` present | — | Docs |
| Public docs | Docs search API | PASS-LIM | local | `/api/docs/search` present + unit-covered; live relevance not click-tested on prod | No tenant | Docs |
| Auth | Login / logout / redirect gating | PASS | prod | 307 → `/sign-in?returnTo=…`; `@auth0/nextjs-auth0` | — | Platform |
| Auth | Anonymous session | PASS | prod | `/api/auth/me` → `{authenticated:false,…}`, no secrets | — | Platform |
| Auth | Role-based routing | PASS | local e2e | admin.spec: owner loads admin; viewer forbidden | — | Platform |
| Auth | MFA / step-up | NOT-IMPL | — | no in-app step-up path (Auth0-side if configured) | Auth0-side | Platform |
| Doc Agent | Conceptual/endpoint/snippet/CQL/troubleshooting | PASS | local | 44/44 demo-critical + 120 chat-accuracy cases | — | Agent |
| Doc Agent | Citations grounded to real pages | PASS | local | `chat-accuracy-citations`; same-origin `/docs/` slugs | — | Agent |
| Doc Agent | No-match / unsupported abstention | PASS | local | demo refusal cases + `agent-safety` | — | Agent |
| Doc Agent | Multi-turn / context reset | PASS | local | `chat-accuracy-multiturn` | — | Agent |
| Doc Agent | Live LLM/Pinecone answers | PASS-LIM | prod | verified via deterministic fallback; live keys not in test env | No live-key smoke | Agent |
| Support Agent | Zendesk search / drafts / escalation | DISABLED | all | `support_agent` not in `DEFAULT_ENABLED`; fail-closed `SUPPORT_AGENT_UNAVAILABLE`; `chat-accuracy-support` 18 states, no fabricated tickets | Off by default | Product |
| Admin | Admin shell + permission-aware nav | PASS | local e2e | admin.spec 13/13; nav unit tests | — | Platform |
| Admin | Control-plane CRUD + APIs | PASS-LIM | local | routes + `guardEnterpriseApi` + CSRF + org scoping in code; prod `401` unauth | Writes not live-tested | Platform |
| Admin | API keys / service accounts | PASS-LIM | local | routes + `api-keys.ts`; one-time reveal/hash not live-tested | No tenant | Platform |
| Admin | Custom domains | PASS-LIM | local | routes present; provider verification not live-tested | No tenant | Platform |
| Admin | Webhooks / rate limits / logs / audit | PASS-LIM | local | routes + `auditApiEvent` + `rate-limit.ts` in code | Not live-tested | Platform |
| Change mgmt | Draft→submit→review→approve→schedule→deploy→rollback | PASS-LIM | local | full workflow in `change-workflow.ts`; optimistic concurrency | Not live-deployed | Platform |
| Change mgmt | Developer self-approval denial | PASS | local | `change-workflow.ts:295-298` throws `SELF_APPROVAL` | — | Platform |
| API runner | Read-only validation path | PASS | local | `/api/run` auth guard + method allowlist + protocol check | — | Platform |
| API runner | Live execution gate | DISABLED | prod | `ENABLE_API_EXECUTION !== "true"` → 403 default | Off by default | Platform |
| API runner | SSRF / private-IP / metadata / redirect | PASS | local | `public-host.ts` + 8 unit tests; per-hop redirect revalidation | — | Security |
| Generated app | Build/edit/preview/download/import/deploy/commit | DISABLED | all | flags not in `DEFAULT_ENABLED` | Off by default | Product |
| Connectors | Zendesk/Jira/etc. sync | NOT-IMPL / DISABLED | all | no enabled live sync engine; support connector fail-closed | Not built | Product |
| Security | XSS / injection / dynamic-exec | PASS | local | markdown/hljs escaping; sandboxed iframe JS runner; no runtime `eval`/`new Function`; `documentation-ui-security` tests | — | Security |
| Security | Prompt-injection refusal | PASS | local | `agent-safety` + demo refusal cases | — | Security |
| Security | CSRF | PASS | local+prod | `requireMutationCsrf`; fail-loud 32-char secret; prod 401 unauth | — | Security |
| Security | Tenant isolation | PASS | local | org-scoped repository queries; per-resource re-guard | Not multi-tenant live-tested | Security |
| Security | Secret handling | PASS | local | secret scan 0/1485; memory-only creds per design | — | Security |
| Security | Global CSP / baseline headers | PASS-LIM | branch/prod | HSTS on prod; `noindex`+`nosniff`+`X-Frame:DENY`+Referrer+Permissions on `/admin/*` & `/api/admin/control-plane/*` via `next.config.ts`; global CSP is branch-only | Global CSP not merged | Security |
| Security | Code-health analyzer + ledger | PASS-LIM | branch | `scripts/health/*` branch-only | Not on prod | Security |
| UX/A11y | Chat readability + snippet gating | PASS | local | response-quality suite + formatting report | — | UX |
| UX/A11y | Full WCAG 2.2 AA sweep | PASS-LIM | local | `a11y.ts` + `a11y.test.ts` + e2e; no live screen-reader/zoom sweep | Manual audit pending | UX |
| Observability | Request/trace/conversation/job IDs + audit | PASS-LIM | local | `observability.ts` + `audit.ts`; prod telemetry not inspected | No prod log access | Platform |

---

## 5. Niche / negative / edge-case results by prompt phase

### §3 Route & access-boundary
Prod: `/`, `/agent`, `/admin`, `/docs/ctix` all `307 → /sign-in?returnTo=<encoded>` (correct
gated redirect, encoded return URL — no open redirect observed; returnTo is a same-origin path).
`/sign-in` carries `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` and
HSTS. Admin routes carry `X-Robots-Tag: noindex, nofollow`. **PASS-LIM** (unauthenticated
boundary confirmed on prod; authenticated deep-link/back-forward/prefetch matrix code-verified).

### §4 Authentication & session
Anonymous `/api/auth/me` returns `authenticated:false` with empty permissions and `user:null` —
no token, no session identifier leaked. Auth via `@auth0/nextjs-auth0` (server-side session).
No token in URL/body of observed responses. Idle/absolute timeout, session rotation, MFA are
Auth0-tenant concerns (**NOT-IMPL** in-app). **PASS-LIM**.

### §5 Authorization / RBAC / BOLA / BFLA / tenant isolation
Prod unauth `POST` to 5 mutating endpoints all `401`. Server-side enforcement via
`guardDocumentationApi` / `guardEnterpriseApi`; tenant/org ID derived from verified session
(`organization-context.ts`), never from browser input; per-resource re-guard on change actions;
self-approval denied (`SELF_APPROVAL`). Cross-tenant enumeration blocked by org-scoped queries.
**PASS** for enforcement logic; cross-tenant *live* probing not possible without two tenants →
tenant-isolation live test is **PASS-LIM**.

### §6 Public documentation
Disabled on prod by Auth0 gate (**DISABLED BY DESIGN**). Local build renders ~530 pages with no
route errors; markdown rendered via `react-markdown` + hljs (escaped). No stale/broken-anchor
sweep run live. **PASS-LIM** for rendered content.

### §7 AI product routing & intent
CTIX/CFTR/CSAP/Orchestrate routing, explicit-override-for-the-turn, cross-product prompts,
context reset, and collision words (`fix`/`build`/`export`/`deploy`/`download`/`commit`/`show
code`/`open ticket`/`search support`) are covered by `agent-product-scope`,
`agent-product-access`, `intent.ts`, and demo cases. No `unknown` debug output surfaced.
**PASS** (deterministic-fallback evidence; live-LLM novel phrasing **PASS-LIM**).

### §8 Strict AI factual accuracy
120 chat-accuracy + 44 demo-critical cases ground every API claim to the 639-endpoint manifest.
Adversarial hallucination-pressure prompts abstain (no invented endpoint/SDK/URL). **PASS**
(fallback); live-LLM **PASS-LIM**.

### §9 Chat readability & §10 snippet behavior
Response-quality suite enforces direct-answer-first, short paragraphs, no giant chapters, and
snippet gating (snippet appears only for explicit code requests; suppressed for
conceptual/troubleshooting/comparison/connector-state/permission prompts). Unavailable C# yields
an explicit disclaimer (no fabricated C#). The exact §9 prompt ("get 404 exporting indicators
after an upgrade — what should I check?") maps to the concise-diagnosis troubleshooting path.
**PASS** (fallback).

### §11 Streaming / retry / cancel / persistence
Turn streaming + cancel route (`/api/agent/conversations/[id]/turns/[turnId]/cancel`);
single-final-response + multi-turn covered by tests. Live multi-tab/reconnect/Strict-Mode/
network-loss not exercised without a tenant. **PASS-LIM**.

### §12 Retrieval & index / §13 citation
Hybrid Pinecone + BM25 fallback; local fallback deterministic; `agent-retrieve` +
`bm25-length-normalization` tests (the prior high-impact length-normalization retrieval bug
fixed at `340a969` re-verified green). Citations same-origin `/docs/` slugs; no arbitrary URL.
Live vector-provider outage / reconciliation / index-drift assessed by design (fallback path).
**PASS** for fused local retrieval + citation grounding; **PASS-LIM** for live vector behavior.

### §14 Support Agent / Zendesk
Run only when real and enabled — it is **not**. `support_agent` off by default; connector states
fail closed with `SUPPORT_AGENT_UNAVAILABLE`; `chat-accuracy-support` covers 18 documented
states with no invented tickets/resolutions and no internal-note leakage. **DISABLED BY DESIGN.**

### §15 Admin control plane
All ~40 admin pages present + permission-gated + `noindex`. CRUD/list/filter/sort/pagination/
drawer wired to repository layer (org-scoped). Prod unauth admin API `401`. No page shows mock
data as real (mock-data module is clearly labeled/gated). Live authed CRUD not click-tested.
**PASS-LIM**.

### §16 API key & secret lifecycle
`api-keys.ts`: create/one-time-reveal/hash-storage/scope/expiry/rotation/revocation code
present; secret scan confirms no secret in source. Live reveal-once + revoked-key-rejection not
live-tested without a tenant. **PASS-LIM**.

### §17 Custom domains / §18 webhooks
Add/verify/DNS/SSL and sign/verify/HMAC/replay-protection code paths present; SSRF protection
shared with `public-host.ts`. Live provider verification + live delivery not exercised. **PASS-LIM.**

### §19 Production change management
`change-workflow.ts` implements draft→submit→request-changes→approve→reject→schedule→deploy→
validate→rollback with optimistic concurrency (`IDEMPOTENCY_CONFLICT`), separation of duties,
and self-approval denial. Live deploy/rollback not executed. **PASS-LIM** (self-approval denial
itself is **PASS**).

### §20 API runner (SSRF hardening) — deep dive
`/api/run` layers: auth guard → JSON parse → method allowlist (`GET/POST/PUT/PATCH/DELETE/HEAD/
OPTIONS`) → protocol check (http/https only) → demo simulation short-circuit →
`ENABLE_API_EXECUTION` gate (403 default) → product-registry destination allowlist →
`urlHasOpenApiAuth` requirement → `assertPublicUrl` → `safeFetch` with per-hop DNS revalidation,
`redirect: "manual"`, 5-redirect cap, 20s `AbortController` timeout, 2 MB streamed response cap,
and stripping of `Host`/`Content-Length`/`Connection` headers. `isPrivateIp` blocks `10/8`,
`127/8`, `0/8`, `169.254/16` (incl. cloud metadata `169.254.169.254`), `172.16–31`, `192.168/16`,
`100.64–127` (CGNAT), `224+` (multicast/reserved), IPv6 `::1`/`::`/`fc`/`fd` (ULA)/`fe80`
(link-local)/`ff` (multicast)/`::ffff:` (mapped). Covered by 8 `public-host` unit tests.
**PASS** (execution gate DISABLED on prod).

### §21 Generated-app features / ZIP import
`app_builder`/`preview`/`vercel_deployment`/`git_commit`/`project_download`/`vercel_import` all
off by default. Archive/import path has `artifact-allowlist` + `check-archive.mjs` guard against
`../` traversal / absolute path / symlink / bomb. **DISABLED BY DESIGN** (guards **PASS** in code).

### §22 Connector & sync
No enabled live connector-sync engine. Readiness would require auth+read+DB+index+search+
freshness — none of which can be truthfully claimed. **NOT-IMPL / DISABLED**.

### §23 Upload / import / export
Multipart upload capped by `MAX_UPLOAD_BYTES`; `Host`/`Content-Length` stripped; archive checks
present; no localStorage of file data. Full malware/DLP/OCR matrix is design-level. **PASS-LIM**.

### §24 XSS / HTML / Markdown injection
Markdown rendered via `react-markdown` (no `dangerouslySetInnerHTML`); hljs self-escapes; JS
runner is a sandboxed `<iframe sandbox="allow-scripts">` without `allow-same-origin`.
`documentation-ui-security` + `public-docs-layout` tests assert no unsafe HTML. **PASS**.

### §25 Command / code-execution / sandbox
No `eval` / `new Function` / VM in runtime; JS execution is sandboxed-iframe only; Pyodide runs
client-side in WASM. **PASS**.

### §26 CSRF / CORS / CSP / headers
`requireMutationCsrf` on control-plane mutations; fail-loud 32-char secret; HSTS on prod;
per-route `nosniff`/`X-Frame:DENY`/Referrer/Permissions on admin. No wildcard-CORS-with-
credentials observed. Global CSP is branch-only. **PASS-LIM** (global CSP not merged).

### §27 Rate limiting / abuse
`rate-limit.ts` + `rate-limit-plan` tests (per-user/tenant/endpoint plans). Distributed
multi-instance enforcement is single-node design. **PASS-LIM**.

### §28 Database / migration / consistency
Migrations `001`–`005`; org-scoped repository; optimistic-concurrency in change workflow;
`conversation-store` tests. Live backup/PITR not in scope. **PASS-LIM**.

### §29 Background jobs & schedulers
`job-processor.ts` + `control-plane/jobs` tenant-scoped, idempotent; `enterprise-control-plane`
tests. Live worker-restart/dead-letter not exercised. **PASS-LIM**.

### §30 Observability & audit
`observability.ts` request/trace IDs; `audit.ts` immutable append with sensitive-read +
privileged-mutation events. Prod telemetry not directly inspected. **PASS-LIM**.

### §31 Health-score analyzer
Branch-only (`security/health-score-remediation`); AST-based classification + dedup + ledger on
that branch, not on prod. **PASS-LIM (not on prod)**.

### §32 Accessibility
`a11y.ts` helpers + `a11y.test.ts` + e2e; landmark/heading/focus assertions. Live screen-reader
+ 200/400% zoom sweep not re-run. **PASS-LIM**.

### §33 Performance / §34 chaos / §35 browser / §36 i18n
No load/chaos/multi-browser/i18n harness wired into this repo. Assessed by design: SSG docs are
static; retrieval has a deterministic fallback (graceful degradation); dependency-failure paths
return sanitized errors (no raw provider error, no fabrication). **PASS-LIM** where design
supports the property; **N/A** where no tooling exists to produce honest deployed evidence.

---

## 6. §37 Demo-critical acceptance scenarios

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Public docs without login | DISABLED | prod 307 → sign-in (by design) |
| 2 | Agent requires login | PASS | `/agent` → 307 sign-in |
| 3–7 | CTIX conceptual/endpoint/Python/404-troubleshoot/CQL | PASS | demo + chat-accuracy suites |
| 8–10 | CFTR / CSAP endpoint, Orchestrate code | PASS | product-scope suites |
| 11–13 | Product override / cross-product / context switch | PASS | product-scope + intent tests |
| 14–15 | Unsupported endpoint / hallucination pressure | PASS | abstention/refusal cases |
| 16–17 | Duplicate stream event / cancel-retry | PASS-LIM | cancel route + tests; live not exercised |
| 18 | Zendesk similar-ticket search | DISABLED | fail-closed by design |
| 19 | Regular user denied admin | PASS | admin.spec viewer-forbidden |
| 20–24 | Developer prod read-only / submit / self-approval denied / admin approves / rollback | PASS-LIM | `change-workflow.ts` (self-approval denial **PASS**) |
| 25 | API key one-time reveal | PASS-LIM | code path; not live-tested |
| 26 | Domain verification | PASS-LIM | code path; not live-tested |
| 27 | Webhook signed delivery | PASS-LIM | signing code; delivery gated |
| 28 | Rate-limit enforcement | PASS-LIM | `rate-limit` tests |
| 29 | Sensitive-log redaction | PASS | `maskText` + observability sanitization |
| 30 | XSS blocked | PASS | ui-security tests + sandboxed iframe |
| 31 | SSRF blocked | PASS | `public-host` tests + execution gated off |
| 32–33 | App build / deploy-blocked-on-lint | DISABLED | app_builder off by default |
| 34 | Health analyzer accurate | PASS-LIM | branch-only |
| 35 | Final production build | PASS | build ~530 pages this pass |

No demo-critical scenario is **FAIL**. The DISABLED ones are intentional and fail-closed.

---

## 7. §38 Fix-and-rerun loop

**No confirmed FAIL / demo blocker was found.** Therefore the fix loop produced **no code
changes and no new regression tests** this pass — the honest outcome given green gates and a
mandate not to fabricate fixes or force-merge unreviewed branches. The 5 real bugs fixed while
reaching `340a969` (snippet-request detection, silent C# substitution, Orchestrate status/cancel
routing, CFTR catch-all over-match, BM25 length-normalization retrieval) were re-verified green
via their regression tests in this pass's `npm test` run (753/753).

---

## 8. Security results (Phases 5, 24–27, 30)

| Control | Result | Evidence |
|---|---|---|
| SSRF (`/api/run` + `public-host.ts`) | PASS | private/loopback/CGNAT/link-local/metadata/IPv6-ULA blocked; per-hop redirect revalidation; 20s timeout; 2 MB cap; Host/Content-Length/Connection stripped; 8 unit tests |
| Live API execution | DISABLED | `ENABLE_API_EXECUTION` flag → 403 |
| Auth gating | PASS | prod 307 redirects; anonymous `/api/auth/me`; unauth mutating APIs 401 |
| CSRF | PASS | `requireMutationCsrf`; fail-loud 32-char secret |
| Separation of duties / self-approval | PASS | `SELF_APPROVAL` throw; distinct submit vs approve perms |
| Tenant isolation | PASS (live PASS-LIM) | org-scoped queries + per-resource re-guard |
| XSS / dynamic-exec | PASS | hljs/markdown escape; sandboxed iframe; no runtime `eval`/`new Function` |
| Prompt injection | PASS | fabrication + secret-disclosure refusals |
| Secrets | PASS | scan clean 0/1485; memory-only creds |
| Headers (HSTS/admin) | PASS | HSTS prod; noindex/nosniff/X-Frame/Referrer/Permissions on admin |
| Global CSP + analyzer | PASS-LIM | branch-only, not on prod |

No confirmed critical/high vulnerability. No secret leak. No cross-tenant access. No unauthorized
side effect. No mock production data surfaced as real.

---

## 9. Remaining limitations & accepted risks

| # | Limitation / risk | Owner | Control | Follow-up |
|---|---|---|---|---|
| 1 | Authenticated prod workflows (admin writes, live deploy, live runner, live Zendesk) not click-tested — no test tenant | Release eng | Source + local suites + prod HTTP smoke | Provide sandbox tenant next pass |
| 2 | Chat suites use deterministic fallback, not live LLM/Pinecone | Agent team | Documented design; retrieval fix benefits both | Add live-key smoke in CI secret context |
| 3 | Global CSP + code-health analyzer on `security/health-score-remediation`, not prod | Security | Not merged; needs rebase onto `340a969` + review | Review & merge decision |
| 4 | Security branch predates `340a969`; naive merge needs rebase | Security | Documented | Rebase before merge |
| 5 | Generated-app / Support-Agent / connector engines disabled by default | Product | Feature-flag fail-closed | Enable per-tenant when built |
| 6 | Full live WCAG 2.2 AA sweep not re-run | UX | `a11y` unit + e2e coverage | Schedule manual audit |
| 7 | No SAST/SBOM/license/load/chaos tooling wired in repo | Platform | Design analysis + gates | Add tooling to CI |
| 8 | E2E CSRF-secret error when `AUTH_SECRET` unset (fail-loud, not a prod bug) | Platform | Prod sets `AUTH_SECRET` (health `authConfig:true`) | Optionally set in e2e env |

All accepted risks have an owner and a control; none is a confirmed critical/high vulnerability.

---

## 10. Rollback plan

- **Prod rollback:** revert to the previous Vercel deployment (immutable deployments) via the
  Vercel dashboard; `main` history is linear so `git revert <sha>` + push also restores prior
  behavior.
- **No DB migrations, feature-flag changes, or prompt/model/index version changes** were made
  this pass — nothing to roll back on the data or config layer.
- **Security branch** left untouched on `origin`; no merge performed.

---

## 11. Build & deployment results (Phases 24–25)

- **Build:** `npm run build` → ~530 SSG pages, no route errors (this pass).
- **Deployment:** this validation pass commits the report(s) to `main` and deploys via
  `npx vercel --prod --yes`. The resulting commit SHA and new deployment ID are recorded in the
  **Deployment record** section below (appended after deploy so the SHA matches the deployed
  commit).

### Deployment record

- Report commit SHA (report first landed): `26a988d` on `main` (`340a969..26a988d`, pushed to `origin/main`).
- This finalizing commit SHA: recorded by the follow-up commit that adds this record.
- New production deployment ID: **`dpl_14hDv9FKjcWwuRwaoMEuu7gCdUnE`** (`readyState: READY`, `target: production`).
- Production URL (aliased): `https://intel-exchange-runnable-docs.vercel.app`
- Deployment build URL: `https://intel-exchange-runnable-docs-5r6bv2bdz-nihalcodes-projects.vercel.app`
- Inspector: `https://vercel.com/nihalcodes-projects/intel-exchange-runnable-docs/14hDv9FKjcWwuRwaoMEuu7gCdUnE`
- Environment: production (Vercel).
- Health after deploy (re-smoked): `/api/health/live` → 200; `/api/health/ready` → 200 `{"status":"ready","checks":{"database":true,"authConfig":true}}`; gating intact (`/agent`, `/docs/ctix` → 307 sign-in).

> Note: `dpl_14hDv9FKjcWwuRwaoMEuu7gCdUnE` deploys the tree at `26a988d` (this report). The
> deployed application source is identical to `340a969` — the only delta on `main` is this
> documentation report, so the deployed product behavior matches the validated `340a969` baseline.

---

## 12. Final decision

# READY WITH DOCUMENTED LIMITATIONS

`main @ 340a969` on `https://intel-exchange-runnable-docs.vercel.app` is demo-ready for the
Documentation Agent, authenticated docs experience, admin control plane (read paths +
code-verified workflows), API runner (SSRF-safe, execution gated off), and security posture.
Every local release gate is green with fresh evidence; unauthenticated production behavior is
correct and fail-closed; and every "PASS" above is backed by cited evidence rather than a loaded
page or a badge.

The limitations are honest and non-blocking for a controlled demo:

- Public docs are intentionally Auth0-gated (**DISABLED BY DESIGN**).
- Support Agent / Zendesk, generated-app, and connector engines are fail-closed / disabled.
- Global CSP + code-health analyzer remain **unmerged on the security branch** and must not be
  presented as production-active.
- Authenticated write-path features are code-verified but not live-tested without a sandbox
  tenant; live-LLM/vector answers are validated via the deterministic fallback only.

This is **not** a false GO: no demo-critical feature is failing, and no confirmed critical/high
security issue exists on the deployed baseline.
