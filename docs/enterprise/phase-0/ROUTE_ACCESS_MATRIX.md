# Route Access Matrix (as-built → target)

Source of truth today: `src/lib/documentation-auth/proxy-auth.ts` (`PUBLIC_PATHS` / `PUBLIC_API_*`) plus layout/API guards.

**Critical product-contract gap:** Public documentation pages (`/`, `/docs/**`, `/guides`, `/changelog`) are **not** on the public allowlist. With Auth0 enabled, nearly every page redirects unauthenticated users to `/sign-in`. `.env.example` currently documents this as intentional; the enterprise prompt requires the opposite for public docs.

Legend: **Current** = behavior on this branch with auth enabled. **Target** = Phase 2 contract.

| Route | Kind | Current | Target | Permission / notes | CSRF | Rate limit | Cache | Audit |
|---|---|---|---|---|---|---|---|---|
| `/` | page | protected | **public** | product landing | n/a | none | public-ok | no |
| `/docs`, `/docs/[product]`, `/docs/...` | page | protected | **public*** | *private docs exception TBD | n/a | none | public-ok | no |
| `/guides`, `/changelog` | page | protected | **public** | curated content | n/a | none | public-ok | no |
| `/sign-in`, `/access/**`, `/invite`, `/post-login` | page | public | public | auth UX | n/a | none | no-store | no |
| `/auth/**` | Auth0 | public (matcher skip) | public | SDK routes | SDK | Auth0 | no-store | Auth0 |
| `/agent` | page | protected | protected | `ask_agent` + product creds | n/a | TBD | no-store | yes |
| `/authentication` | page | protected | protected | credential forms | mutations | TBD | no-store | yes |
| `/settings/users`, `/settings/content` | page | protected | protected | `manage_users` / content | mutations | TBD | no-store | yes |
| `/developer` | page | protected | protected | diagnostics / Postman | mutations | TBD | no-store | yes |
| `/admin`, `/admin/**` | page | protected | admin-only | `admin_dashboard.access` (+ finer) | mutations | TBD | no-store | yes |
| `/api/health/live`, `/api/health/ready` | API | public | public | no secrets in body | n/a | TBD | no-store | no |
| `/api/auth/session`, `/me`, `invite-check` | API | public | public / session | session probe | n/a | TBD | no-store | no |
| `/api/invites/validate` | API | public | reassess | invite legacy | n/a | TBD | no-store | limited |
| `/api/products`, `/api/products/[id]` | API | **public** | public metadata only | expose product catalog | n/a | TBD | short cache | no |
| `/api/docs/search` | API | protected | **public** if flag on | search | n/a | yes | short | no |
| `/api/agent`, `/api/agent/**` | API | protected | protected | agent + side effects gated | yes | yes | no-store | yes |
| `/api/run` | API | protected | protected + flag | `ENABLE_API_EXECUTION` | yes | yes | no-store | yes |
| `/api/authentication/credentials` | API | protected | protected | encrypted product creds | yes | yes | no-store | yes |
| `/api/users`, `/api/users/**` | API | protected | admin | `manage_users`; direct Auth0 provision | yes | yes | no-store | yes |
| `/api/admin/**` | API | protected | admin | control-plane permissions | yes | yes | no-store | yes |
| `/api/developer/**` | API | protected | developer+ | diagnostics / Postman | yes | yes | no-store | yes |

## Tenant scoping sources (current)

| Surface | Source |
|---|---|
| Auth session | Auth0 user → `documentation_users` row |
| Organization | `organization_memberships` / enterprise context |
| Agent product scope | Server `listValidCredentialProductIds` + query product names |
| Control-plane resources | Organization/environment IDs from server context |

## Notes

1. Proxy **fail-open** when `AUTH_DISABLED` or Auth0 incomplete (`NextResponse.next()`).
2. Invite routes remain public; invite **creation** is legacy — primary admin path is direct Auth0 add (`POST /api/users`).
3. Exact permission strings live in `src/lib/documentation-auth/permissions.ts` and admin capability checks.
