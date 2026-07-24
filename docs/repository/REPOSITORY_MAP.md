# Repository map

High-level layout for developers joining the Cyware runnable docs platform.

## Architecture summary

- **Auth0** remains the OAuth/OIDC session broker (`@auth0/nextjs-auth0`).
- **Okta** owns password, Okta Verify TOTP, user lifecycle, and membership in **Cyware Docs Users** (`OKTA_DOCS_GROUP_ID`).
- The **application** owns local invitation/membership, organization, role, expiry, product access, and Post-Login invite-check (`/api/auth/invite-check`).
- **Four product contexts:** CTIX, CFTR, CSAP, Orchestrate (host- or env-pinned product identity).

Do not commit secrets, Okta API tokens, Auth0 client secrets, or production cookies.

## Top-level directories

| Path | Responsibility |
|---|---|
| `src/app` | Next.js App Router pages and API routes (docs, agent, admin, auth, settings) |
| `src/components` | UI: docs chrome, runners, Ask AI, admin panels, auth forms |
| `src/lib` | Domain logic: Auth0/Okta, documentation-auth, agent/RAG, DB, analytics, products |
| `src/content` | Vendored documentation JSON + manifests per product |
| `scripts` | Ingest, auth diagnose/smoke, Vercel env sync, health/security utilities |
| `e2e` | Playwright end-to-end specs |
| `docs` | Operator and enterprise documentation (auth, UI, repository hygiene) |
| `public` | Static assets |
| `drizzle` / DB helpers under `src/lib/db` | Schema and migrations for documentation users, invites, analytics |
| `.github/workflows` | CI and multi-product build matrix |

## Auth entry points (orientation)

| Area | Location |
|---|---|
| Auth0 client | `src/lib/auth0.ts` |
| Sign in / Sign up | `src/app/sign-in`, `src/app/sign-up` |
| Fresh login | `src/app/access/fresh-login` |
| Invite check | `src/app/api/auth/invite-check` |
| Add user | `src/app/api/users` + `src/lib/okta/users.ts` |

## Products

| Product | Typical production host / project |
|---|---|
| CTIX | `apitest1.cyninjadev.com` / `cyware-docs-ctix` |
| CFTR | `cyware-docs-cftr.vercel.app` |
| CSAP | `cyware-docs-csap.vercel.app` |
| Orchestrate | `cyware-docs-orchestrate.vercel.app` |

## Further reading

- [BRANCHING.md](./BRANCHING.md)
- [BRANCH_CLEANUP_PLAN.md](./BRANCH_CLEANUP_PLAN.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- `docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md`
