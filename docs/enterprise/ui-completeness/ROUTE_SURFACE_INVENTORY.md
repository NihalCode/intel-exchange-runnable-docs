# Route Surface Inventory

**Source of truth:** real App Router `src/app/**/page.tsx` files only (45 pages).  
**Do not invent routes** (e.g. there is no `/admin/support-agent`).  
**Date:** 2026-07-24  
**Related:** `docs/enterprise/ui-max-v2/FINAL_REPORT.md`, `src/lib/admin/navigation.ts`, `src/lib/documentation-auth/route-policy.ts`

## Legend

| Field | Meaning |
|---|---|
| **Kind** | `PAGE` rendered UI · `REDIRECT` server redirect alias |
| **productContext** | Hub / product docs / agent / auth / settings / admin |
| **requiredRole** | Best-effort from layout gates / `hasPermission` / `evaluateAdminAccess` / `requirePermission` |
| **featureFlags** | From nav `featureFlag` or page `requireAdminFeature` / agent feature map |
| **redesignStatus** | `COMPLETE` only for honestly polished shell · `IN_PROGRESS` fabric chrome with legacy controls · `NOT_STARTED` deep legacy · `n/a` redirects |

### Shared chrome (not per-route)

| Shell | Routes | UI |
|---|---|---|
| `AppFrame` via `ConditionalAppFrame` | Most non-admin, non-bare-auth routes | Header, product selector, `DocsSearch`, `ThemeToggle`, mobile nav drawer, `CommandPalette` (Ctrl/Cmd+K), permission-gated Ask AI / Settings / Content / Admin links |
| Bare (no AppFrame) | `/sign-in`, `/access/*`, `/invite`, `/post-login`, `/auth/*` | Standalone |
| `AdminLayout` → `AdminLayoutClient` → `AdminFrame` | `/admin/**` | `AdminSidebar` (`ADMIN_NAV_GROUPS`), `AdminHeader`, env selector, theme toggle, mobile FAB + drawer, `ProductionBanner`, MFA/permission forbidden states |

### Route counts

| Category | Count |
|---|---:|
| Total `page.tsx` | **45** |
| Rendered PAGE surfaces | **36** |
| REDIRECT aliases | **9** |

---

## 1. Public hub

### `/` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/page.tsx` |
| **productContext** | Multi-product docs hub |
| **requiredRole** | Public (`isAnonymousHubPath`) |
| **featureFlags** | — |
| **pageLayout** | `data-layout="cx-home-hub"`: cinematic hero (`sf-atmosphere`, `SignalTopologyArt`, `VerificationNode`) → product constellation (`CxProductCard`) → resource cards → `WorkflowRibbon` |
| **tabs / nestedTabs** | — |
| **panes / drawers / dialogs / popovers** | AppFrame mobile drawer + `CommandPalette` only |
| **forms / inputs** | `DocsSearch` (hub size) |
| **buttons / iconButtons** | Ask AI link; product/resource/workflow links |
| **tables / filters** | — |
| **statuses** | Verification chips (Indexed / Runnable / Invite-gated); “Not indexed” meta |
| **loading / empty / error / permission** | — (static hub) |
| **mobile / dark** | Topology art `hidden lg:block`; responsive grids; CSS vars + `.dark` |
| **currentLegacyIssues** | Minimal; fabric/`Cx*` materials |
| **redesignStatus** | **COMPLETE** |

---

## 2. Auth & access

### `/sign-in` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/sign-in/page.tsx` |
| **productContext** | Auth |
| **requiredRole** | Public; bare layout |
| **featureFlags** | — |
| **pageLayout** | `cx-split-auth`: `SecurityBrandPanel` + `sf-access-panel` CTA column |
| **tabs / panes / drawers / dialogs / popovers** | — |
| **forms / inputs** | — (Auth0 redirect CTA; no password form) |
| **buttons** | Sign in (`freshLoginStartHref`); Sign up link |
| **statuses** | `login-error` / `login-hint` banners; DB / auth-setup checklist |
| **loading / empty / error / permission** | Error/hint/setup incomplete states; CTA hidden if auth env not ready |
| **mobile / dark** | Stacked split; banner `dark:` variants |
| **currentLegacyIssues** | None material |
| **redesignStatus** | **COMPLETE** |

### `/sign-up` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/sign-up/page.tsx` → `OktaSignUpForm` |
| **productContext** | Auth / Okta signup |
| **requiredRole** | Public (**still wrapped by AppFrame** — not in bare prefixes) |
| **featureFlags** | — |
| **pageLayout** | `cx-split-auth` brand aside + floating form card |
| **forms / inputs** | Email; submit “Set password” |
| **buttons** | Submit; Back to Sign in |
| **statuses** | `role="alert"` form error; busy “Sending…” |
| **loading / empty / error / permission** | Form error / busy |
| **mobile / dark** | Split stacks; limited atmosphere vs sign-in |
| **currentLegacyIssues** | Simpler brand panel (not full `SecurityBrandPanel`); AppFrame may show |
| **redesignStatus** | **IN_PROGRESS** |

### `/invite` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/invite/page.tsx` → `InvitePageClient` |
| **productContext** | Invite acceptance |
| **requiredRole** | Public; bare layout |
| **featureFlags** | — |
| **pageLayout** | Centered card; `Suspense` fallback |
| **forms / inputs** | — (token from query) |
| **buttons** | Continue / Continue to sign in |
| **statuses** | Valid invite shows email |
| **loading / empty / error / permission** | “Validating invite…”; invalid → access links |
| **mobile / dark** | Centered; `dark:bg-zinc-950` |
| **currentLegacyIssues** | Heavy `bg-zinc-50` / `border-zinc-200` / `bg-white` / zinc CTA |
| **redesignStatus** | **NOT_STARTED** |

### `/post-login` — REDIRECT

| Field | Value |
|---|---|
| **File** | `src/app/post-login/page.tsx` |
| **productContext** | Auth bounce |
| **requiredRole** | Public |
| **behavior** | Cross-host Auth0 bounce · session → `returnTo` · `accessDenied` → `/access/*` · Auth0-only → `/sign-in` · else `/access/invite-required` |
| **UI** | None (server redirects) |
| **redesignStatus** | **n/a (REDIRECT)** |

### `/access/invite-required` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/access/invite-required/page.tsx` → `AccessPage` |
| **productContext** | Access gate |
| **requiredRole** | Public; bare |
| **pageLayout** | `sf-access-plane` / `sf-access-panel` |
| **buttons** | Back to sign in; Browse documentation home |
| **redesignStatus** | **IN_PROGRESS** |

### `/access/invite-expired` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/access/invite-expired/page.tsx` → `AccessPage` |
| **productContext** | Access gate |
| **requiredRole** | Public; bare |
| **pageLayout** | Same `AccessPage` fabric plane |
| **redesignStatus** | **IN_PROGRESS** |

### `/access/disabled` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/access/disabled/page.tsx` → `AccessPage` |
| **productContext** | Access gate (account disabled) |
| **requiredRole** | Public; bare |
| **redesignStatus** | **IN_PROGRESS** |

### `/access/wrong-email` — PAGE (conditional REDIRECT)

| Field | Value |
|---|---|
| **File** | `src/app/access/wrong-email/page.tsx` |
| **productContext** | Access gate |
| **requiredRole** | Public; if `!auth0Authenticated` → **redirect `/`** |
| **pageLayout** | `AccessPage` with invited email in copy |
| **redesignStatus** | **IN_PROGRESS** |

---

## 3. Documentation

### `/docs/[...slug]` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/docs/[...slug]/page.tsx` |
| **productContext** | Legacy CTIX slug-only docs |
| **requiredRole** | `docs/layout` → `requireProtectedWorkspace()` (Auth0 session) |
| **featureFlags** | — |
| **pageLayout** | `EndpointView` **or** `<article>` + `Markdown` |
| **tabs** | Snippet language tabs inside `CodeBlock` / runners |
| **panes / drawers** | AppFrame docs sidebar (when present) |
| **forms / inputs** | HttpRunner: query editors, credentials, payload editor |
| **buttons** | Run / confirm mutating; copy |
| **tables** | `ParamTable` (params / headers / body fields) |
| **filters** | Sidebar filter in `Sidebar` |
| **statuses** | Method badge; run status/duration |
| **loading / empty / error / permission** | `notFound()`; runner error/empty response |
| **mobile / dark** | Sidebar → mobile drawer; runner stacks |
| **currentLegacyIssues** | No product breadcrumbs/TOC/prev-next; utilitarian runners (`runners-shared` zinc inputs) |
| **redesignStatus** | **IN_PROGRESS** |

### `/docs/[product]` — REDIRECT

| Field | Value |
|---|---|
| **File** | `src/app/docs/[product]/page.tsx` |
| **behavior** | Pinned-host mismatch → `notFound()`; else `redirect(/docs/{product}/{rootSlug})` |
| **products** | `ctix` / `csap` / `orchestrate` / `cftr` |
| **redesignStatus** | **n/a (REDIRECT)** |

### `/docs/[product]/[...slug]` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/docs/[product]/[...slug]/page.tsx` |
| **productContext** | Per-product docs reader |
| **requiredRole** | Workspace (Auth0) |
| **featureFlags** | — |
| **pageLayout** | `cx-docs-reader`: `DocsBreadcrumbs`, `ProductBadge`, `EndpointView` or Markdown + `DocsToc` + `DocsPrevNext` |
| **tabs** | Snippet runners |
| **panes / drawers** | TOC rail; AppFrame `Sidebar` + mobile drawer |
| **forms / inputs** | Same HttpRunner / credential / payload editors |
| **tables** | Param tables |
| **empty** | “Docs not indexed” ingest instructions when manifest empty |
| **mobile / dark** | TOC collapses; product accent modules |
| **currentLegacyIssues** | Endpoint tables/runners still zinc/utilitarian; fabric atmosphere on shell only |
| **redesignStatus** | **IN_PROGRESS** |

---

## 4. Workspace content (AppFrame)

### `/guides` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/guides/page.tsx` |
| **productContext** | Guides hub |
| **requiredRole** | `guides/layout` → workspace |
| **pageLayout** | `cx-guides-page`: getting-started, platform, product, CTIX topic link lists |
| **buttons** | Link cards only |
| **statuses** | “Not indexed” / page counts |
| **currentLegacyIssues** | Widespread `rounded-lg border border-zinc-200` cards |
| **redesignStatus** | **NOT_STARTED** |

### `/changelog` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/changelog/page.tsx` |
| **productContext** | Changelog |
| **requiredRole** | Workspace |
| **pageLayout** | Title + empty state (`changelog-empty`) |
| **buttons** | Browse API reference; Ask the Documentation Agent |
| **empty** | “No published changes yet” |
| **currentLegacyIssues** | Light; mostly CSS vars |
| **redesignStatus** | **IN_PROGRESS** |

### `/authentication` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/authentication/page.tsx` → `CredentialManager` |
| **productContext** | Product Open API credentials |
| **requiredRole** | Protected path (Auth0); no dedicated permission layout |
| **pageLayout** | Page intro (sky/zinc) + `cx-credential-workspace` |
| **forms / inputs** | Product `<select>`; Base URL / Access ID / Secret Key |
| **buttons** | Test & connect; Disconnect |
| **statuses** | Connected / Not connected; `role="status"` success/error |
| **currentLegacyIssues** | Page chrome sky/zinc; global materials only (ui-max-v2 gap) |
| **redesignStatus** | **IN_PROGRESS** |

### `/agent` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/agent/page.tsx` → `AgentChat` (or gate) |
| **productContext** | Documentation Agent / Ask AI |
| **requiredRole** | Workspace; **viewer** → `notFound()` unless `resolveViewerAskAiAccessEnabled`; else credential policy |
| **featureFlags** | Passed into chat: `app_builder`, `project_workspace`, `preview`, `vercel_deployment`, `git_commit`, `project_download`, `vercel_import`, `chat_feedback` |
| **pageLayout** | `SignalField` intro + `AgentChat` (`cx-ask-workspace`) **or** `cx-ask-gate` lock CTA |
| **tabs / nestedTabs** | Blueprint / diff tabs inside app-builder views |
| **panes** | `AgentChatSidebar` (sessions); main stage; optional `AgentProjectPanel`; `AgentSavedAppsBar` |
| **drawers / dialogs** | Source/citation chrome; `ImportVercelModal`; `AgentDeployModal` (feature-gated) |
| **forms / inputs** | Language `<select>`; attach; composer `textarea`; feedback controls |
| **buttons / iconButtons** | Send; quick-start chips; paperclip; feedback |
| **empty / loading / error / permission** | Empty conversation art; aria-live progress; credential gate → `/authentication`; viewer `notFound` |
| **mobile / dark** | Sidebar collapses; fabric field |
| **currentLegacyIssues** | Shell polished; message/project/deploy surfaces still zinc borders (`AgentMessageView`, modals) — ui-max-v2 gaps 2–3 |
| **redesignStatus** | **IN_PROGRESS** |

### `/developer` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/developer/page.tsx` → `DeveloperConsole` |
| **productContext** | Developer diagnostics |
| **requiredRole** | `developer/layout` → workspace (copy: authorized developers) |
| **pageLayout** | Title + stacked zinc card sections |
| **forms / inputs** | Bearer token; Postman product select + textarea |
| **buttons** | Validate / Import; diagnostics actions |
| **statuses / error** | Error banner; JSON `<pre>` results |
| **currentLegacyIssues** | Full zinc card system |
| **redesignStatus** | **NOT_STARTED** |

---

## 5. Settings

### `/settings` — REDIRECT

| Field | Value |
|---|---|
| **File** | `src/app/settings/page.tsx` |
| **Target** | `/settings/users` |
| **redesignStatus** | **n/a (REDIRECT)** |

### `/settings/users` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/settings/users/page.tsx` → `UsersManagementPanel` |
| **productContext** | Workspace user management |
| **requiredRole** | Workspace + `hasPermission(..., "manage_users")` else `notFound()` |
| **featureFlags** | — |
| **pageLayout** | Title + identity panel (tokenized framing in places) |
| **forms / inputs** | Add user: email, name, role `<select>`, expires |
| **tables** | Users table: role, status, last login, Disable |
| **filters** | — |
| **statuses** | User status cells |
| **loading / empty / error / permission** | Loading; error/hint; session recovery; `notFound` if no permission |
| **mobile / dark** | Table scroll; zinc header borders |
| **currentLegacyIssues** | Dense table; needs status-stack + action drawer (ui-max-v2 gap 5) |
| **redesignStatus** | **IN_PROGRESS** |

### `/settings/content` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/settings/content/page.tsx` → `ContentManagementPanel` |
| **productContext** | Content sync / import |
| **requiredRole** | `sync_docs` **or** `manage_sources` else `notFound()` |
| **forms / inputs** | Sync product select; Import product select + textarea |
| **buttons** | Sync from source; Validate; Import |
| **loading / empty / error / permission** | Loading; permission empty; error; result section |
| **currentLegacyIssues** | `rounded-lg border border-zinc-200` sections throughout |
| **redesignStatus** | **NOT_STARTED** |

---

## 6. Admin — shared gate

**Layout:** `src/app/admin/layout.tsx`

| Denial / state | UI |
|---|---|
| Auth env incomplete | `AuthConfigRequired` (zinc checklist) |
| No session | Auth0 login redirect or `ForbiddenState` |
| MFA / org / permission / inactive / recent auth | `ForbiddenState` + CTAs |
| Allowed | `AdminLayoutClient` with `capabilities` + `enabledFeatures` |

**Enterprise roles (best-effort):** owner / admin / developer with org membership (+ MFA when required).

---

### `/admin` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/admin/page.tsx` → `AdminOverviewPage` |
| **productContext** | Admin dashboard |
| **requiredRole** | Admin layout + `admin_dashboard.access` |
| **featureFlags** | — |
| **pageLayout** | `sf-admin-dashboard`: `PageHeader`, telemetry strip, health topology, operational timeline |
| **tables** | — (activity list) |
| **statuses** | `HealthStatusRow`; `StatusBadge` on activity |
| **empty** | “No audit events recorded yet.” |
| **currentLegacyIssues** | Still uses `PageHeader` / `MetricCard` under fabric strip |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/documentation-agent` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/admin/documentation-agent/page.tsx` → `DocumentationAgentOverviewPage` |
| **requiredRole** | `admin_dashboard.access` |
| **pageLayout** | `PageHeader` + placeholder `MetricCard`s + quick links (APIs / Sync Jobs / Keys) |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/documentation-agent/schemas` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationSchemasPage` |
| **requiredRole** | `schemas.read` |
| **pageLayout** | Create form + schema/version cards |
| **forms / inputs** | Name; format/product/environment selects; source textarea |
| **buttons** | Validate / preview / publish |
| **statuses** | Version status pills (`bg-zinc-100`) |
| **currentLegacyIssues** | Deep zinc form cards (ui-max-v2 gap 1) |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/users` — PAGE

| Field | Value |
|---|---|
| **File** | → `UsersManagementPanel` (same as settings) |
| **requiredRole** | `admin_dashboard.access` |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/documentation-agent/authentication` — PAGE

| Field | Value |
|---|---|
| **File** | Inline page (policy blurb + count + link to `/authentication`) |
| **requiredRole** | `credentials.read_metadata` |
| **pageLayout** | Zinc bordered card |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/features` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationFeaturesPage` |
| **requiredRole** | `features.read`; toggles need `features.manage` |
| **pageLayout** | Sectioned feature matrix rows |
| **buttons** | Enable / disable |
| **statuses** | Effective / auto-enabled notes; zinc pills |
| **currentLegacyIssues** | Features matrix not bespoke (ui-max-v2 gap 1) |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/deployments` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationAgentDeploymentsPage` |
| **requiredRole** | `deployments.read` |
| **featureFlags** | `admin_deployment_management` |
| **pageLayout** | `PageHeader`; create form; deployment cards |
| **forms / inputs** | Deployment create + domain attach |
| **buttons** | Workflow actions |
| **statuses** | `StatusBadge` |
| **empty** | “No product deployments configured.” |
| **dialogs** | Debug `<pre>` surfaces |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/environments` — REDIRECT

| Field | Value |
|---|---|
| **Target** | `/admin/environments` |
| **Nav note** | Still listed in `ADMIN_NAV_GROUPS` (alias) |
| **redesignStatus** | **n/a (REDIRECT)** |

### `/admin/documentation-agent/change-requests` — REDIRECT → `/admin/change-requests`

### `/admin/documentation-agent/audit-logs` — REDIRECT → `/admin/audit-logs`

### `/admin/documentation-agent/settings` — REDIRECT → `/admin/security/settings`

### `/admin/documentation-agent/security` — REDIRECT → `/admin/security/settings`

### `/admin/documentation-agent/jobs` — REDIRECT → `/admin/documentation-agent/sync-jobs`

### `/admin/documentation-agent/apis` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationAgentApisPage` |
| **requiredRole** | `resources.read` (+ manage perms for mutations) |
| **pageLayout** | `PageHeader`; resource forms; change-request flows |
| **tables** | `DataTable` (resources + related) |
| **filters** | Search/filter within tables |
| **drawers / dialogs** | `DetailsDrawer`; `ConfigurationDiff`; `SecretCreatedDialog` / one-time secret |
| **forms / inputs** | Create/schedule/rollback fields |
| **statuses** | `StatusBadge`; `PermissionGate` |
| **currentLegacyIssues** | Dense control-plane zinc + legacy admin UI kit |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/sync-jobs` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationAgentSyncJobsPage` |
| **requiredRole** | `jobs.read`; manage → `jobs.manage` |
| **pageLayout** | `PageHeader` actions + searchable `DataTable` |
| **buttons** | Process due jobs; enqueue |
| **statuses** | `StatusBadge` |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/documentation-agent/keys` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationAgentKeysPage` |
| **requiredRole** | `credentials.read_metadata`; create/rotate → `credentials.manage` |
| **pageLayout** | Create form + `DataTable` + Rotate/Revoke |
| **dialogs** | `SecretCreatedDialog` |
| **statuses** | `StatusBadge` |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/documentation-agent/domains` — PAGE

| Field | Value |
|---|---|
| **File** | → `DocumentationAgentDomainsPage` |
| **requiredRole** | `domains.read` |
| **featureFlags** | Shows `host_based_product_routing` enabled state (soft) |
| **pageLayout** | Add-mapping form + table |
| **statuses** | Verification / TLS `StatusBadge` |
| **empty** | `domains-empty` |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/query-analytics` — PAGE

| Field | Value |
|---|---|
| **File** | → `QueryAnalyticsPage` |
| **requiredRole** | `query_analytics.read` |
| **featureFlags** | `query_analytics` |
| **filters** | since / until / productId / hostname (`searchParams`) |
| **pageLayout** | `PageHeader` + large `MetricCard` grid + recent events |
| **empty / error** | loadError; “No analytics recorded yet.” |
| **currentLegacyIssues** | Still `MetricCard` (signal strip framing only) |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/documentation-agent/unanswered` — PAGE

| Field | Value |
|---|---|
| **File** | → `UnansweredQueriesPage` |
| **requiredRole** | `query_analytics.read` |
| **featureFlags** | `unanswered_query_review` |
| **pageLayout** | Review list; expand query `<pre>`; status actions |
| **empty** | “No unanswered query reviews yet.” |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/unanswered/weekly` — PAGE

| Field | Value |
|---|---|
| **File** | → `UnansweredWeeklyPage` |
| **requiredRole** | `query_analytics.read` |
| **featureFlags** | `unanswered_query_weekly_analytics` |
| **pageLayout** | `PageHeader` + HTML snapshot table |
| **empty / disabled** | Hidden while feature disabled |
| **redesignStatus** | **NOT_STARTED** |

### `/admin/documentation-agent/logs` — PAGE

| Field | Value |
|---|---|
| **File** | `src/app/admin/documentation-agent/logs/page.tsx` → `DocumentationAgentLogsPage` |
| **requiredRole** | `audit.read` |
| **pageLayout** | Audit-oriented log table (`DataTable` / status pattern) |
| **currentLegacyIssues** | Legacy admin UI kit |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/environments` — PAGE

| Field | Value |
|---|---|
| **File** | → `EnvironmentsPage` |
| **requiredRole** | `resources.read` |
| **pageLayout** | `PageHeader` + env groups with resource `StatusBadge` |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/change-requests` — PAGE

| Field | Value |
|---|---|
| **File** | → `ChangeRequestsPage` |
| **requiredRole** | `changes.create` |
| **pageLayout** | `PageHeader` + `DataTable` + `StatusBadge` |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/audit-logs` — PAGE

| Field | Value |
|---|---|
| **File** | → `AuditLogsPage` |
| **requiredRole** | `audit.read` |
| **pageLayout** | `PageHeader` + `DataTable` + outcome `StatusBadge` |
| **redesignStatus** | **IN_PROGRESS** |

### `/admin/security/settings` — PAGE

| Field | Value |
|---|---|
| **File** | → `SecuritySettingsPage` → `SecuritySettingsForm` |
| **requiredRole** | `security_settings.manage` |
| **pageLayout** | `PageHeader` + policy form |
| **forms / inputs** | Zinc bordered inputs; sky save |
| **statuses** | Live save status |
| **redesignStatus** | **NOT_STARTED** |

---

## Redesign status rollup

| Status | Routes |
|---|---|
| **COMPLETE** | `/`, `/sign-in` |
| **IN_PROGRESS** | `/sign-up`, `/access/*`, `/docs/*` (rendered), `/changelog`, `/authentication`, `/agent`, `/settings/users`, admin overview/lists/keys/sync/logs/environments/change-requests/audit-logs/query-analytics |
| **NOT_STARTED** | `/invite`, `/guides`, `/developer`, `/settings/content`, schemas, features, deployments, domains, unanswered*, security form, APIs control-plane, admin authentication blurb |
| **REDIRECT** | `/post-login`, `/docs/[product]`, `/settings`, `/admin/documentation-agent/{environments,change-requests,audit-logs,settings,security,jobs}` |

## Explicit non-routes

These paths are **not** App Router pages in this repo (do not inventory as live UI):

- `/admin/support-agent` (does not exist)
- Any invented “support console” beyond listed admin documentation-agent surfaces
