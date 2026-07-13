# Enterprise Administrative Control Plane

Phase 1 delivers a tenant-scoped administrative foundation for managing Documentation Agent APIs and related control-plane resources. Access is deny-by-default at every layer: middleware, server layouts, API routes, repository queries, and (on Postgres) row-level security.

## Architecture overview

```
Browser (/admin/*)
  └─ admin/layout.tsx          server auth + MFA step-up + policy check
  └─ DocumentationAgentDashboard (client mutations via control-plane APIs)

/api/admin/control-plane/*
  └─ guardEnterpriseApi()      session + org context + permission + MFA
  └─ CSRF (mutations)          signed double-submit cookie + header
  └─ rate limit (mutations)    30/min per org+user
  └─ repository / workflow     org-scoped transactions
  └─ audit events              sanitized, append-only

PostgreSQL (production)
  └─ migration 002             org tables + RLS policies
  └─ session vars              app.organization_id, app.user_id
```

SQLite is used for local development and Vitest; Postgres RLS applies in production when `DATABASE_URL` points to Postgres.

## Roles and permissions

| Role | Admin dashboard | Read resources | Write (non-prod) | Write production | Approve changes | Manage credentials | Sensitive audit |
|------|-----------------|----------------|------------------|------------------|-----------------|--------------------|-----------------|
| **owner** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **developer** | Yes | Yes | Yes | No | No | No | No |
| **documentation_manager** | No | — | — | — | — | — | — |
| **viewer** | No | — | — | — | — | — | — |

`owner` maps to full administrator privileges (same permission set as `admin` in Phase 1).

Permissions are evaluated by `authorizeEnterprise()` in `src/lib/enterprise/policy.ts`. UI capability gating is additive only; APIs and layouts enforce authorization independently.

### Enterprise permissions (Phase 1)

- `admin_dashboard.access` — enter `/admin/*`
- `resources.read` / `resources.write` / `resources.write_production`
- `changes.create` / `changes.submit` / `changes.approve` / `changes.activate` / `changes.rollback`
- `credentials.read_metadata` / `credentials.manage`
- `audit.read` / `audit.read_sensitive`
- `security_settings.manage`, `jobs.read`, `jobs.manage` (reserved for later phases)

## Approval workflow

Production-impacting changes use an explicit state machine:

```
DRAFT → PENDING_REVIEW → APPROVED → DEPLOYING → ACTIVE
              ↓                              ↓
          REJECTED                      ROLLED_BACK
```

Rules enforced in `src/lib/enterprise/change-workflow.ts`:

- **Self-approval denied** — requester cannot approve their own change.
- **Optimistic locking** — `expectedVersion` required on every transition.
- **Idempotency** — `Idempotency-Key` header on change creation deduplicates drafts.
- **Atomic activation** — deploy + activate runs in a single transaction.
- **Developers** may create/submit staging changes; production writes and approvals require owner/admin.

## Secret storage

| Asset | Storage | Exposure |
|-------|---------|----------|
| API keys (control plane) | SHA-256 hash + last4 in DB; optional `vault_ref` | Plaintext returned **once** on create/rotate only |
| Auth0 session secrets | Auth0 / sealed cookies | Never logged or exported |
| CTIX Open API keys (docs runner) | Memory-only in browser | Never in localStorage |

The vault abstraction (`src/lib/enterprise/vault.ts`) is provider-neutral. Phase 1 stores hashes locally; external vault references can be attached without changing API contracts.

Audit metadata is passed through `redactStructuredValue()` before persistence. Exports and list endpoints omit `keyHash` and `vaultRef`.

## Tenant isolation

1. **Organization identity** comes only from trusted Auth0 org claims (`session.claims.organizationId`) or a verified single-tenant bootstrap path — never from request body, query, or client headers.
2. **Repository methods** always require `organizationId` as the first filter.
3. **Transactions** set `app.organization_id` / `app.user_id` session variables for Postgres RLS.
4. **Cross-tenant access** returns generic `404` / `403` responses (non-enumerating).

## Audit strategy

- Append-only `enterprise_audit_events` table; deletes blocked by trigger (SQLite) or policy (Postgres).
- Each control-plane mutation records action, outcome, actor, correlation/request IDs.
- Sensitive substrings (tokens, `Authorization:` headers, `ix_` key patterns) redacted before write.
- `GET /api/admin/control-plane/audit` returns sanitized events; sensitive fields require `audit.read_sensitive` (owner/admin only).

## Threat model (Phase 1)

| Threat | Mitigation |
|--------|------------|
| Unauthorized admin access | Server layout guard, API `guardEnterpriseApi`, proxy-auth redirect for `/admin` |
| CSRF on mutations | Signed double-submit token + same-origin check |
| Privilege escalation | Central policy engine; developer production deny rules |
| Cross-tenant data leak | Org-scoped repos + RLS + non-enumerating errors |
| Secret exfiltration via exports | Metadata-only credential listings; audit redaction |
| SSRF via `/api/run` | `safeFetch` with per-redirect host validation (`src/lib/security/public-host.ts`) |
| Session fixation / stale privilege | MFA step-up for sensitive permissions; recent-auth window (10 min) |
| Enumeration of resources | 404 for missing or cross-tenant IDs |
| Abuse of admin APIs | 30 mutations/min per org+user rate limit |

## External infrastructure requirements

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres in production (SQLite acceptable locally) |
| `AUTH0_*` | Auth0 tenant, client, secret, domain (existing docs auth) |
| `CSRF_SIGNING_SECRET` or `AUTH0_SECRET` (32+ chars) | CSRF token signing |
| `INITIAL_OWNER_EMAIL` | Cold-start owner bootstrap (existing) |

### Auth0 Organizations

- Enable Auth0 Organizations for multi-tenant deployments.
- Map the org ID into the session claim consumed as `session.claims.organizationId` (configured in Auth0 Actions/Rules).
- Enforce MFA for owner/admin/developer via Auth0 — session must include `amr` containing `mfa`, `otp`, `webauthn`, or `hwk`, or an `acr` value indicating MFA.

### Database migration

Run migrations on deploy (automatic on app start via `src/lib/db/migrations/index.ts`). Version 2 creates enterprise control-plane tables and Postgres RLS policies.

## Phase 1 API surface

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/control-plane/context` | `admin_dashboard.access` |
| GET/POST | `/api/admin/control-plane/resources` | read / write |
| GET/PATCH | `/api/admin/control-plane/resources/[id]` | read / write |
| GET/POST | `/api/admin/control-plane/resources/[id]/versions` | read / write |
| GET/POST | `/api/admin/control-plane/changes` | read / create |
| POST | `/api/admin/control-plane/changes/[id]/[action]` | submit/approve/reject/activate/rollback |
| GET/POST | `/api/admin/control-plane/credentials` | read_metadata / manage |
| POST | `/api/admin/control-plane/credentials/[id]/[action]` | rotate / revoke |
| GET | `/api/admin/control-plane/audit` | `audit.read` |
| GET | `/api/admin/control-plane/export?kind=configuration\|audit` | read / audit.read |

Health endpoints (unauthenticated): `/api/health/live`, `/api/health/ready`.

## UI entry points

- **Dashboard:** `/admin/documentation-agent/apis`
- **Nav link:** App shell shows “Admin” when `/api/auth/me` reports `enterpriseCapabilities` includes `admin_dashboard.access`.

## Remaining assumptions and Phase 2+ work

- Background job execution and `jobs.manage` operational tooling are schema-ready but not exposed in UI.
- `security_settings.manage` is defined but not yet wired to settings screens.
- External vault provider integration (AWS Secrets Manager, HashiCorp Vault) uses `vault_ref` placeholders only.
- Scheduled changes (`SCHEDULED` state) are modeled; cron/worker activation is future work.
- Playwright smoke tests run with `AUTH_DISABLED=true` and `x-test-role` headers; production MFA paths require manual verification.
- Distributed rate limiting uses in-memory buckets (adequate for single-region serverless; Redis recommended for multi-instance hardening).

## Operator checklist (production)

1. Set `DATABASE_URL` to managed Postgres.
2. Configure Auth0 Organizations and MFA for privileged roles.
3. Ensure org claim populates `session.claims.organizationId`.
4. Set `CSRF_SIGNING_SECRET` (or rely on `AUTH0_SECRET` if 32+ chars).
5. Deploy and confirm `/api/health/ready` returns `{ status: "ready" }`.
6. Log in as owner with MFA → open `/admin/documentation-agent/apis`.
7. Verify viewer/doc_manager accounts receive forbidden state (no data leak).

## Security test coverage (Phase 1)

Vitest covers policy matrix, CSRF, tenancy isolation, API key hashing, audit immutability/redaction, workflow self-approval denial, SSRF redirect validation, mutation rate limits, MFA step-up helpers, and proxy-auth path classification. Playwright smoke tests cover admin forbidden state for viewers, owner dashboard load, and `noindex` headers.
