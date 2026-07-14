# Route Access Matrix (Auth0-gated product policy)

Source of truth: `src/lib/documentation-auth/route-policy.ts` plus layout guards
(`requireProtectedWorkspace` on `/docs`, `/guides`, `/changelog`, `/agent`, `/settings`, `/developer`).

**Product decision (current):** the documentation application is Auth0-gated end-to-end.
Only auth UX and health/session probes are public. The AI agent additionally requires
per-user product API credentials after sign-in.

| Route | Kind | Access | Notes |
|---|---|---|---|
| `/`, `/docs/**`, `/guides`, `/changelog` | page | Auth0 session required | Layout + proxy protected |
| `/sign-in`, `/access/**`, `/invite`, `/post-login`, `/auth/**` | page | public | Auth UX |
| `/agent` | page | Auth0 + product credentials | Credential gate before chat |
| `/authentication`, `/settings/**`, `/developer`, `/admin/**` | page | Auth0 (+ role/capability) | Privileged surfaces |
| `/api/health/*`, `/api/auth/session`, `/me`, `invite-check`, `/api/invites/validate` | API | public | Probes / session helpers |
| `/api/products*`, `/api/docs/search`, `/api/agent/**`, `/api/run`, `/api/admin/**` | API | Auth0 (and perms) | No anonymous API use |

Proxy fail-open when `AUTH_DISABLED=true` (local/e2e only).
