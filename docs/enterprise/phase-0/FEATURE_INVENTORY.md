# Feature Inventory

| Feature | Entry points | Classification | Default flag / gate | Owner module | Phase |
|---|---|---|---|---|---|
| Documentation browsing | `/`, `/docs/**` | REAL content; **wrong auth** (protected) | none | `src/content`, SSG | 2 |
| Documentation search | `/api/docs/search`, UI | REAL | `public_documentation_search` ON | search routes | 2, 7 |
| AI Documentation Agent | `/agent`, `/api/agent` | REAL | `ai_documentation_assistant` ON | `src/lib/agent/*` | 5–9 |
| Product credential gate | Authentication UI + agent | REAL | encryption key required | `documentation-credentials/*` | 3 |
| Live API runner | CodeBlock runners, `/api/run` | REAL, high risk | `ENABLE_API_EXECUTION` OFF | `api/run`, `public-host` | 13 |
| App builder | agent intent + codegen | REAL, gated | `app_builder` OFF | `app-builder.ts` | 6, 12 |
| App edit | agent intent | REAL, gated | `app_builder` + project flags | `app-edit-rules.ts` | 6, 12 |
| Preview / workspace | agent UI | GATED | `project_workspace`, `preview` OFF | agent clients | 12 |
| Vercel deploy | `/api/agent/deploy` | GATED; **quality bypass** | `vercel_deployment` OFF | `api/agent/deploy` | 12 |
| Git commit | `/api/agent/commit` | GATED | `git_commit` OFF + env | commit route | 12 |
| Project download ZIP | `/api/agent/zip` | GATED | `project_download` OFF | zip route | 12 |
| Vercel import | `/api/agent/vercel/pull` | GATED | `vercel_import` OFF | pull route | 12 |
| Chat persistence | agent workspace | **localStorage** | n/a | `workspace-client.ts` | 5 |
| Saved apps | agent UI | **localStorage** | n/a | `saved-apps-client.ts` | 5, 12 |
| Admin documentation control plane | `/admin/documentation-agent/**` | MIXED REAL/MOCK | role-gated | enterprise + mock-data | 4 |
| Admin Support Agent | `/admin/support-agent/**` | **MOCK only** | `support_agent` OFF | `SupportAgentPages.tsx` | 4, 10 |
| Zendesk pipeline | none end-to-end | **NOT IMPLEMENTED** | hide/default-off | — | 10 |
| User provisioning | `/api/users`, Users panel | REAL (Auth0 Mgmt) | Management API env | `auth0-management` | 3 |
| Invite links | `/invite`, invite APIs | LEGACY still present | Resend optional | invite-gate | cleanup |
| Secret vault | enterprise API keys | hash-only local mode; configured vault fails closed | vault provider selection | `vault-providers.ts` | 3 |
| Feature flags UI | `/admin/.../features` | REAL DB flags | server-evaluated | `documentation-features` | 4 |

## Admin page classification (detail)

See explore notes; summary:

- **REAL:** APIs, schemas, users, authentication, features, sync-jobs, keys, logs, environments, change-requests, audit-logs, security settings, admin overview metrics (partial).
- **MOCK:** Support Agent (all), documentation sources/webhooks/domains, rate-limits, security roles & service-accounts.
- **GATED:** deployments page when `vercel_deployment` on.

## Feature-flag defaults

From `src/lib/documentation-features/index.ts`:

| Flag | Default |
|---|---|
| `ai_documentation_assistant` | ON |
| `generated_code_examples` | ON |
| `public_changelog` | ON |
| `public_documentation_search` | ON |
| `app_builder` | OFF |
| `project_workspace`, `preview`, `vercel_deployment`, `git_commit`, `project_download`, `vercel_import`, `api_testing_console` | OFF |
| `support_agent` | OFF — hides all Support Agent routes and navigation |
| `placeholder_admin_modules` | OFF — hides incomplete admin modules and routes |

The Support Agent mock health row is not shown on the main admin overview.
