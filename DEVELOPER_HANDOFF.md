# Developer Handoff — Cyware API Docs (Runnable Reference)

**Audience:** engineers taking over this repository and its four Vercel product deployments.  
**Repo:** `intel-exchange-runnable-docs`  
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Vitest, Vercel  

This document is the operational handoff. For day-to-day coding conventions also read [`AGENTS.md`](./AGENTS.md) and [`CONTRIBUTING.md`](./CONTRIBUTING.md). Product-facing overview lives in [`README.md`](./README.md).

---

## Table of contents

1. [What this system is](#1-what-this-system-is)
2. [Repository map](#2-repository-map)
3. [Local setup](#3-local-setup)
4. [Environment variables](#4-environment-variables)
5. [Cloud services](#5-cloud-services)
6. [Authentication (Okta + Auth0)](#6-authentication-okta--auth0)
7. [App surfaces — what each tab / route does](#7-app-surfaces--what-each-tab--route-does)
8. [Ask AI / RAG pipeline](#8-ask-ai--rag-pipeline)
9. [Content ingest and indexes](#9-content-ingest-and-indexes)
10. [Deploy and multi-product ops](#10-deploy-and-multi-product-ops)
11. [Known pitfalls and recent fixes](#11-known-pitfalls-and-recent-fixes)
12. [Quality gates and useful scripts](#12-quality-gates-and-useful-scripts)
13. [Deeper documentation index](#13-deeper-documentation-index)

---

## 1. What this system is

A **runnable API documentation platform** for four Cyware products:

| Product ID | Product | Typical docs path | Prod host (current) |
|---|---|---|---|
| `ctix` | Intel Exchange (CTIX) | `/docs/ctix/…` | `https://apitest1.cyninjadev.com` (also `cyware-docs-ctix.vercel.app`) |
| `cftr` | CFTR | `/docs/cftr/…` | `https://cyware-docs-cftr.vercel.app` |
| `csap` | CSAP (Collaborate) | `/docs/csap/…` | `https://cyware-docs-csap.vercel.app` |
| `orchestrate` | Cyware Orchestrate | `/docs/orchestrate/…` | `https://cyware-docs-orchestrate.vercel.app` |

One **git repo** feeds **four Vercel projects**. Each project sets `APP_PRODUCT_ID` so the deployment is product-scoped (content namespace, Pinecone namespace, canonical URL).

Capabilities:

- Browse vendored API docs with runnable snippets (HTTP via `/api/run`, JS sandbox, Pyodide).
- **Ask AI** (`/agent`) — RAG over doc chunks (Pinecone or local BM25 fallback).
- Invite-only workspace auth: **Okta** owns password + Okta Verify; **Auth0** is a thin session broker.
- Admin control plane for schemas, features, users, analytics, unanswered triage, deployments.

---

## 2. Repository map

```text
src/
  app/                 # Next.js App Router (pages + API routes)
  components/          # UI (AppFrame, Ask AI, admin, runners, Signal Fabric)
  content/             # Vendored docs JSON + manifests (per product)
  lib/                 # Auth, agent/RAG, enterprise, security, products
scripts/               # ingest, pinecone, vercel sync, health, analytics
docs/                  # Enterprise KT, auth, architecture reports
AGENTS.md              # Authoritative agent coding guide
.env.example           # Canonical env catalog (copy → .env.local)
```

Important entry points:

| Area | Path |
|---|---|
| Shell / primary nav | `src/components/AppFrame.tsx` |
| Route access policy | `src/lib/documentation-auth/route-policy.ts` |
| Admin nav definitions | `src/lib/admin/navigation.ts` |
| Auth0 client | `src/lib/auth0.ts` |
| Fresh login (Sign in) | `src/app/access/fresh-login/route.ts` |
| Okta federation KT | `docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md` |

---

## 3. Local setup

### Prerequisites

- **Node** `>=20 <25`, **npm** `>=10`
- Optional: Auth0 + Okta sandbox if you need full login locally
- Optional: Postgres (`DATABASE_URL`); otherwise SQLite is used automatically

### Bootstrap

```bash
git clone <repo-url>
cd intel-exchange-runnable-docs
cp .env.example .env.local
# Fill at least: OPENAI_API_KEY (for Ask AI), AUTH0_* + AUTH0_OKTA_CONNECTION (for auth),
# DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY (for product credential encryption)
npm ci
npm run dev   # http://localhost:3000
```

### Minimum env for different goals

| Goal | Minimum |
|---|---|
| Browse static docs only | Defaults often enough; ingest already vendored under `src/content/` |
| Ask AI (local) | `OPENAI_API_KEY` (Pinecone optional — BM25 fallback) |
| Full auth + Add user | Auth0 + Okta vars + `DATABASE_URL` or SQLite + encryption key |
| Live snippet Run against tenant | `ENABLE_API_EXECUTION=true` + user credentials on `/authentication` |

### Offline / no-auth hack

`AUTH_DISABLED=true` bypasses Auth0 for local exploration. Prefer real Auth0 when testing invite/login.

---

## 4. Environment variables

Canonical source: [`.env.example`](./.env.example). Never commit `.env.local` or real secrets.

### 4.1 OpenAI (server-only — never `NEXT_PUBLIC_`)

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | Chat, embeddings, app-edit LLM | required for Ask AI |
| `OPENAI_MODEL` | Chat/planning model | `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | Query/index embeddings | `text-embedding-3-small` |

### 4.2 Pinecone (RAG)

| Variable | Purpose |
|---|---|
| `PINECONE_API_KEY` | If unset → local BM25 (`agent-index.json`) |
| `PINECONE_INDEX` | Index name (e.g. `intel-exchange-docs`) |
| `PINECONE_CLOUD` / `PINECONE_REGION` | Serverless index placement |
| `VECTOR_NAMESPACE` | Hard isolation per product (`product-ctix`, …). Defaults to `product-{APP_PRODUCT_ID}` |

After content refresh:

```bash
npm run build:index
npm run pinecone:upsert
```

### 4.3 Auth0 + Okta

| Variable | Purpose |
|---|---|
| `AUTH0_SECRET` | Session encryption |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | App credentials |
| `AUTH0_ISSUER_BASE_URL` | Tenant issuer |
| `AUTH0_BASE_URL` / `APP_BASE_URL` | **This deployment’s public origin** (no trailing slash). Must match the host users hit. |
| `AUTH0_ACTION_SHARED_SECRET` | Post-Login invite-check Action |
| `AUTH0_OKTA_CONNECTION` | **Required** — Okta Workforce enterprise connection name |
| `OKTA_ORG_URL` | `https://….okta.com` (never `*-admin.okta.com`) |
| `OKTA_API_TOKEN` | Users API for Add user |
| `OKTA_DOCS_GROUP_ID` | Cyware Docs Users group (`00g…`) |
| `OKTA_APP_ID` | Optional app assignment (soft-fail under Federation Broker Mode) |
| `AUTH_COOKIE_DOMAIN` | e.g. `.cyninjadev.com` when `CROSS_DOMAIN_SSO_ENABLED=true` |
| `INITIAL_OWNER_EMAIL` | Cold-start owner when zero active users |
| `AUTH_DISABLED` | Dev bypass |

Invite email (optional):

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Send/resend invite emails |
| `INVITE_EMAIL_FROM` | From header |
| `INVITE_DEFAULT_EXPIRY_DAYS` | Default 7 |

### 4.4 Database and secrets

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Postgres on Vercel**; omit locally → SQLite |
| `DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY` | Base64 32-byte AES key for product Open API secrets |
| `CSRF_SIGNING_SECRET` | 32+ chars; falls back to `AUTH0_SECRET` |
| `DEVELOPER_ACCESS_TOKEN` | Legacy bearer when auth disabled |
| `CONTROL_PLANE_CRON_SECRET` | Protects scheduled control-plane job routes |

Optional vault: `VAULT_PROVIDER`, `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_MOUNT_PATH`, `AWS_REGION`.

### 4.5 Product / multi-project

| Variable | Purpose |
|---|---|
| `APP_PRODUCT_ID` | `ctix` \| `cftr` \| `csap` \| `orchestrate` |
| `DEFAULT_PRODUCT_ID` | UI default product |
| `ENABLE_API_EXECUTION` | Allow `/api/run` live calls |
| `NEXT_PUBLIC_ENABLE_LIVE_API_UI` | Show live credential UI in shell |
| `NEXT_PUBLIC_DEMO_MODE` | Offline simulated responses |
| `AGENT_REQUIRE_PRODUCT_CREDENTIALS` | Gate Ask AI live tools on connected product keys |
| `VERCEL_TOKEN` / `VERCEL_TEAM_ID` | Admin deployments + `npm run vercel:sync-product-env` |
| `MULTI_PROJECT_DEPLOYMENT` | Enables multi-project admin surfaces |

Domain routing (usually off on single-product Vercel projects):

`DOMAIN_ROUTING_ENABLED`, `CTIX_DOMAIN`, `CFTR_DOMAIN`, `CSAP_DOMAIN`, `ORCHESTRATE_DOMAIN`, `ADMIN_DOMAIN`, `AUTH_DOMAIN`, `SEPARATE_ADMIN_DOMAIN_ENABLED`, `CROSS_DOMAIN_SSO_ENABLED`.

### 4.6 Feature flags (env mirrors + Admin → Features)

Runtime flags are also managed in **Admin → Documentation Agent → Features**. Env mirrors include:

- `QUERY_ANALYTICS_ENABLED`
- `CHAT_FEEDBACK_ENABLED`
- `UNANSWERED_QUERY_REVIEW_ENABLED` (+ sensitive / realtime / weekly variants)
- `VIEWER_ASK_AI_ACCESS_ENABLED`
- `RECAPTCHA_PROTECTION_ENABLED` + `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY`
- `ADMIN_REQUIRE_MFA` (keep false unless Auth0 emits validated MFA claims; Okta Verify is the primary MFA)
- `CUSTOM_SNIPPET_QUERY_PARAMS_ENABLED`, `CHAT_RESPONSE_NAVIGATION_ENABLED`

Keys are defined in `src/lib/documentation-features/keys.ts` (`chat_feedback`, `app_builder`, `query_analytics`, `unanswered_query_review`, `admin_deployment_management`, …).

### 4.7 reCAPTCHA

When `RECAPTCHA_PROTECTION_ENABLED=true`:

- Public invite validation is fail-closed (token required).
- Authenticated Ask AI / feedback remain fail-soft.

---

## 5. Cloud services

| Service | Role |
|---|---|
| **Vercel** | Hosts four product projects + builds from `main` (`iad1`, `next build`) |
| **Auth0** | OIDC session broker; Post-Login invite-check Action; **not** the password IdP |
| **Okta Workforce** | Password, Okta Verify, user/group provisioning for Add user |
| **OpenAI** | Ask AI planning/chat + embeddings |
| **Pinecone** | Vector RAG; per-product namespaces |
| **Postgres** | Production persistence (users, invites, feedback, analytics, control plane) |
| **SQLite** | Local/dev/tests when `DATABASE_URL` unset |
| **Resend** | Invite emails |
| **Google reCAPTCHA v3** | Optional abuse protection |

Team / project names commonly used: `nihalcodes-projects` → `cyware-docs-ctix`, `cyware-docs-cftr`, `cyware-docs-csap`, `cyware-docs-orchestrate`.

---

## 6. Authentication (Okta + Auth0)

Canonical KT: [`docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md`](./docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md) and [`docs/AUTH0_INVITE_ONLY.md`](./docs/AUTH0_INVITE_ONLY.md).

### Flow

```text
Admin → Users → Add user
  → Okta create/link + Cyware Docs Users group
  → Docs invite row (+ optional Resend email)

First-time user → /sign-up (or invite “Set up your account”)
  → Okta password-setup email
  → Set password + enroll Okta Verify
  → Return to Sign in (no automatic session)

Returning user → /sign-in → /access/fresh-login
  → Auth0 /authorize?connection=AUTH0_OKTA_CONNECTION
  → Okta email/password → Okta Verify passcode
  → Auth0 callback → Post-Login invite-check → /post-login → app
```

### Dashboard rules (must stay true)

**Auth0**

- Enable **only** the Okta enterprise connection.
- Disable Database + Google/social.
- Security → MFA policy: **Never** (Okta owns Verify).
- Allowed Callback / Logout URLs: each product **origin** (logout URLs = origin only, no path).

**Okta**

- Group **Cyware Docs Users** (`OKTA_DOCS_GROUP_ID`).
- App sign-on: password + **Okta Verify passcode** (avoid Push-only / “pick another method” for this app).

### Sign-in redirect design

Sign in does **not** jump straight to Auth0. It uses **fresh-login**:

1. `/access/fresh-login` sets short-lived `cyware_fresh_login` cookie.
2. Logs out to Auth0 with `returnTo` = **app origin only** (Allowed Logout URLs).
3. Lands on `/`; middleware reads the cookie and continues to `/auth/login?returnTo=…`.

If the user starts on an **alias host** (e.g. `*.vercel.app`) while `APP_BASE_URL` is another host (e.g. `apitest1…`), fresh-login **canonicalizes onto `APP_BASE_URL` first** so the cookie and logout land on the same host. Otherwise Sign in appears to “loop” back to the home page.

### Common auth errors

| Symptom | Likely cause |
|---|---|
| Okta `E0000004` / Authentication failed on first login | User still STAGED/PROVISIONED — must finish Sign up / activation before Sign in |
| Stuck on home after Sign in | Host/`APP_BASE_URL` mismatch (fresh-login cookie lost) — use canonical host |
| Auth0 “Oops” on logout | Nested `/auth/login` inside logout `returnTo` — never do this |
| Invite required | User not provisioned / invite missing / wrong email |

---

## 7. App surfaces — what each tab / route does

Access rules live in `src/lib/documentation-auth/route-policy.ts`.

### 7.1 Who can open what

| Surface | Anonymous viewer | Signed-in viewer | Admin / elevated |
|---|---|---|---|
| Hub `/`, docs, guides, changelog | Yes | Yes | Yes |
| Ask AI `/agent` (chat) | Yes (ask only) | Yes | Yes |
| Snippet **Run** / live API | No | Needs connected product credentials | Same |
| `/authentication` | No | Yes | Yes |
| `/settings/users`, `/admin/*` | No | Role-gated | Yes |

### 7.2 Primary shell (AppFrame)

| Tab / link | Route | What it does |
|---|---|---|
| **Home** | `/` | Product hub, search entry, overview |
| **Docs** (sidebar) | `/docs/{product}/…` | Endpoint/section pages; runnable code blocks |
| **Guides** | `/guides` | Narrative guides |
| **Changelog** | `/changelog` | Release notes surface |
| **Ask AI** | `/agent` | Documentation Agent chat (RAG). Thumbs up/down feedback; thumbs-down can enqueue **Unanswered** triage. Optional **Build App** dock when feature `app_builder` is on. |
| **Authentication** | `/authentication` | **Product connections** — per-user tenant base URL + Access ID + Secret Key. **Test & connect** validates server-side. Secrets encrypted at rest; runner uses in-memory values for the tab. Required for live Ask AI tools / snippet Run when credential gate is on. |
| **Users** (settings) | `/settings/users` | Add user / invites / roles (also mirrored under Admin → Users) |
| **Content** | `/settings/content` | Content sync / sources (permission: sync docs / manage sources) |
| **Admin** | `/admin` | Control plane (see below) |
| **Product selector** | header | Switches active Cyware product context |
| **Theme / Sign in** | header | Theme toggle; branded Sign in / profile logout |

### 7.3 Ask AI extras

- **Search** in hub: floating results panel (must not be clipped by hero overflow).
- **Feedback**: HELPFUL? thumbs after assistant replies (`chat_feedback`).
- **Build App**: in-chat project panel (preview / deploy / commit / download) — not a separate top-level tab; gated by feature flags.

### 7.4 Admin — Documentation Agent

Nav source: `src/lib/admin/navigation.ts` (items filtered by permission + feature flags).

| Tab | Route | What it does |
|---|---|---|
| **Dashboard** | `/admin` | Admin home |
| **Overview** | `/admin/documentation-agent` | DA summary + quick links |
| **Schemas** | `…/schemas` | Upload/validate OpenAPI, Postman, Theneo, GraphQL SDL; review/approve/publish lifecycle |
| **Users** | `…/users` | Provision users (Okta + invite). Prefer this / settings users for Add user |
| **Authentication** | `…/authentication` | Admin pointer / policy around product credential connections (end users use `/authentication`) |
| **Features** | `…/features` | Runtime feature flags (feedback, unanswered, builder, deployments, …) |
| **Deployments** | `…/deployments` | Multi-project Vercel deployment management (flag `admin_deployment_management`) |
| **Commits** | `…/commits` | Deployable GitHub commit history from Vercel; production switch = propose → approve (APIs) → **Execute** on Commits (not generic CR Activate; not Sync Jobs schedule). Developers may **Request switch**; only owner/admin execute. Not full GitHub history of unbuilt SHAs. |
| **Environments** | `…/environments` | Environment resources |
| **Change Requests** | `…/change-requests` | Controlled config/content changes |
| **Audit Logs** | `…/audit-logs` | Audit trail |
| **Settings** | `…/settings` | DA settings |
| **APIs** | `…/apis` | Registered API resources / control-plane API objects |
| **Sync Jobs** | `…/sync-jobs` | Ingest/sync job status |
| **API Keys** | `…/keys` | Credential metadata (not raw secrets) |
| **Domains** | `…/domains` | Host / domain configuration |
| **Query analytics** | `…/query-analytics` | Ask AI query metrics (flag `query_analytics`) |
| **Unanswered queries** | `…/unanswered` | Triage queue (often fed by thumbs-down) |
| **Unanswered weekly** | `…/unanswered/weekly` | Weekly unanswered analytics |
| **Logs** | `…/logs` | Operational logs view |

### 7.5 Admin — shared + security

| Tab | Route | What it does |
|---|---|---|
| Environments / Change Requests / Audit Logs | `/admin/environments`, `/admin/change-requests`, `/admin/audit-logs` | Shared (non-DA-prefixed) counterparts |
| **Security → Settings** | `/admin/security/settings` | Security settings (CSRF/MFA-related admin controls) |

### 7.6 Auth UX routes (public)

| Route | Purpose |
|---|---|
| `/sign-in` | Branded Sign in → fresh-login → Okta |
| `/sign-up` | First-time Okta password setup kickoff |
| `/invite` | Accept invite; first-time CTA → Sign up |
| `/post-login` | Establish app session after Auth0 callback |
| `/access/*` | Access denied, MFA step-up start, fresh-login, wrong-email, etc. |
| `/auth/*` | Auth0 SDK login/logout/callback |

### 7.7 Developer

`/developer` — privileged diagnostics / Postman import / offline bearer workflows.

---

## 8. Ask AI / RAG pipeline

Implementation sketch (`src/lib/agent/`):

1. **Normalize** query terms (`normalize-query.ts`).
2. **Embed** with `text-embedding-3-small` (512-dim).
3. **Retrieve** via Pinecone (`VECTOR_NAMESPACE`) or BM25 fallback.
4. **Trim** context (`trim-context.ts`).
5. **Plan** with `gpt-4o-mini` (+ rule enforcers for common endpoint mistakes).

Security:

- Credentials never in `localStorage`.
- Outbound tenant calls via `/api/run` (SSRF-protected).
- Snippet Run still requires auth + connected product credentials when gates are on.

Agent route may set elevated `maxDuration` because Hobby’s default serverless duration is too short for LLM round-trips.

---

## 9. Content ingest and indexes

```bash
npm run ingest -- --product=ctix
npm run ingest -- --product=csap
npm run ingest -- --product=orchestrate
npm run ingest -- --product=cftr
npm run ingest:all

npm run build:index
npm run pinecone:upsert
```

- Sources configured in `scripts/products-config.mjs` + `src/lib/products/registry.ts`.
- Vendored pages: `src/content/…`.
- Theneo exports may need browser-like `Referer` (handled by ingest).
- Prefer `scripts/clean-local.mjs` if re-fetch is rate-limited / 403.

---

## 10. Deploy and multi-product ops

### Model

- Git push to **`main`** triggers Vercel builds for linked projects.
- Keep `main`, `backend`, and `frontend` branches aligned when that is the team ship pattern.
- Each product project must have its own:
  - `APP_PRODUCT_ID`
  - `APP_BASE_URL` / `AUTH0_BASE_URL` = that project’s public origin
  - `VECTOR_NAMESPACE` (or rely on default `product-{id}`)
  - Shared Auth0/Okta/OpenAI/Pinecone/Postgres secrets as appropriate

Sync helper:

```bash
# requires VERCEL_TOKEN (+ team id if needed)
npm run vercel:sync-product-env
```

### Auth0 URL allowlist

For **every** product origin (and local `http://localhost:3000`):

- Callback URLs
- Logout URLs = **origin only**
- Web Origins / CORS as required by the tenant

### Hobby plan caveats

- Daily deployment quota (`api-deployments-free-per-day`) can block CLI/`--prod` and new previews. When exhausted, wait for reset or alias an existing Ready deployment of the target git SHA.
- Prefer promoting/aliasing Ready builds over burning quota on redundant deploys.

### Rollback

Promote a prior Ready deployment per Vercel project, or revert git and redeploy all four. See `docs/enterprise/security-hardening/INCIDENT_RESPONSE.md`.

### Health checks

```text
GET /api/health/live
GET /api/health/ready
GET /api/health/auth
```

---

## 11. Known pitfalls and recent fixes

| Issue | Guidance |
|---|---|
| Sign in returns to home without Okta | Ensure you use the **canonical** `APP_BASE_URL` host; fresh-login now canonicalizes alias → canonical before setting the bridge cookie |
| Invited user gets Okta `E0000004` | Complete **Sign up** / activation before Sign in; user must be **Active** in Okta |
| CSRF “Could not initialize a secure request token” after login | `/api/auth/csrf` must work without over-gating; use `authenticatedFetch` for mutations |
| Ask AI feedback “Could not save feedback” | Feedback flag + FK-safe conversation/turn refs + org context (incl. anonymous principal path) |
| Thumbs not showing | `chat_feedback` must be enabled (defaults/features); UI should render after assistant replies |
| Auth0 Oops on MFA step-up | Logout `returnTo` must be origin only — never nest `/auth/login` |
| `401/403` on live Run | Wrong base URL, expired signature, or inactive Open API key |
| Pinecone empty / wrong product | Namespace mismatch — upsert and query must share `VECTOR_NAMESPACE` |

---

## 12. Quality gates and useful scripts

Before committing (repo convention):

```bash
npm test
npx tsc --noEmit   # or npm run typecheck
npm run build
```

| Script | Use |
|---|---|
| `npm run auth:diagnose` / `auth:smoke` | Auth diagnostics |
| `npm run health:scan` | Repo health analysis |
| `npm run security:scan-secrets` | Secret scan |
| `npm run prod:extreme-probe` | Four-product prod probe |
| `npm run local:product-canary` | Local canary with `.env.local` |
| `npm run analytics:reconcile` / `repair` / `weekly-unanswered` | Analytics maintenance |
| `npm run chat:accuracy` | Chat accuracy harness |

Do **not** commit `.tmp-*` deploy scratch files or noisy `scripts/health/findings.json` / `score.json` churn unless intentionally updating baselines.

---

## 13. Deeper documentation index

| Document | Topic |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Coding agent rules, security, RAG/snippet architecture |
| [`README.md`](./README.md) | Product overview + quick start |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Contribution workflow |
| [`docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md`](./docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md) | Okta-authoritative auth |
| [`docs/AUTH0_INVITE_ONLY.md`](./docs/AUTH0_INVITE_ONLY.md) | Invite-only Auth0 setup |
| [`docs/PRODUCTION_AUTH_DEBUG.md`](./docs/PRODUCTION_AUTH_DEBUG.md) | Prod auth debugging |
| [`docs/ENTERPRISE_CONTROL_PLANE.md`](./docs/ENTERPRISE_CONTROL_PLANE.md) | Control plane / roles / CSRF |
| [`docs/repository/REPOSITORY_MAP.md`](./docs/repository/REPOSITORY_MAP.md) | Layout + hosts |
| [`docs/enterprise/prod-chat-build-matrix.md`](./docs/enterprise/prod-chat-build-matrix.md) | Per-product chat/build readiness |
| [`docs/enterprise/prod-chat-and-build-app/BUILD_APP_ARCHITECTURE.md`](./docs/enterprise/prod-chat-and-build-app/BUILD_APP_ARCHITECTURE.md) | Build App architecture |
| [`docs/enterprise/feedback-unanswered-recaptcha/ARCHITECTURE.md`](./docs/enterprise/feedback-unanswered-recaptcha/ARCHITECTURE.md) | Feedback / unanswered / reCAPTCHA |
| [`docs/enterprise/query-analytics/ARCHITECTURE.md`](./docs/enterprise/query-analytics/ARCHITECTURE.md) | Query analytics |
| [`docs/enterprise/ui-completeness/ROUTE_SURFACE_INVENTORY.md`](./docs/enterprise/ui-completeness/ROUTE_SURFACE_INVENTORY.md) | Route inventory |
| [`docs/enterprise/security-hardening/INCIDENT_RESPONSE.md`](./docs/enterprise/security-hardening/INCIDENT_RESPONSE.md) | Incident / rollback |

---

## Handoff checklist (first week)

1. Get Vercel team access to all four `cyware-docs-*` projects + Auth0 + Okta + Pinecone + OpenAI + Postgres.
2. Clone repo, copy `.env.example` → `.env.local`, run `npm ci && npm run dev`.
3. Confirm Auth0 connection list = Okta only; MFA Never; logout URLs = origins.
4. Confirm each Vercel project `APP_BASE_URL` matches its public host.
5. Walk: Add user → Sign up → Sign in + Okta Verify → `/authentication` Test & connect → Ask AI → thumbs → Admin unanswered (if enabled).
6. Run `npm test && npx tsc --noEmit && npm run build` before first PR.
7. Prefer deploying via git to `main`; watch Hobby deploy quotas on free plans.

---

*Last updated for handoff alongside fresh-login `returnTo` / host-canonicalization fixes and Ask AI feedback visibility work on `main`.*
