# Enterprise Administrative Control Plane

Phase 1 delivered a tenant-scoped administrative foundation for managing Documentation Agent APIs and related control-plane resources. **Phase 2** completes the Documentation Agent enterprise dashboard: security settings, background jobs, scheduled activation, vault provider abstraction, change detail/diff APIs, and full credential/change UI workflows.

Access is deny-by-default at every layer: middleware, server layouts, API routes, repository queries, and (on Postgres) row-level security.

## Architecture overview

```
Browser (/admin/documentation-agent/*)
  └─ admin/layout.tsx          server auth + MFA step-up + policy check
  └─ AdminSubNav               APIs | Security | Jobs (capability-gated)
  └─ DocumentationAgentDashboard / SecuritySettingsForm / JobsDashboard

/api/admin/control-plane/*
  └─ guardEnterpriseApi()      session + org context + permission + MFA
  └─ CSRF (mutations)          signed double-submit cookie + header
  └─ rate limit (mutations)    30/min per org+user
  └─ repository / workflow     org-scoped transactions
  └─ audit events              sanitized, append-only

Cron / manual job runner
  └─ POST /api/admin/control-plane/jobs/process
     (CONTROL_PLANE_CRON_SECRET or owner/admin session)
  └─ Activates due SCHEDULED changes + processes queued background_jobs

PostgreSQL (production)
  └─ migrations 002–003        org tables + RLS policies
  └─ session vars              app.organization_id, app.user_id
```

SQLite is used for local development and Vitest; Postgres RLS applies in production when `DATABASE_URL` points to Postgres.

## Roles and permissions

| Role | Admin dashboard | Read resources | Write (non-prod) | Write production | Approve changes | Manage credentials | Security settings | Jobs |
|------|-----------------|----------------|------------------|------------------|-----------------|--------------------|-------------------|------|
| **owner** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | read + manage |
| **admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | read + manage |
| **developer** | Yes | Yes | Yes | No | No | No | No | read only |
| **documentation_manager** | No | — | — | — | — | — | — | — |
| **viewer** | No | — | — | — | — | — | — | — |

`owner` maps to full administrator privileges (same permission set as `admin`).

Permissions are evaluated by `authorizeEnterprise()` in `src/lib/enterprise/policy.ts`. UI capability gating is additive only; APIs and layouts enforce authorization independently.

### Enterprise permissions

- `admin_dashboard.access` — enter `/admin/*`
- `resources.read` / `resources.write` / `resources.write_production`
- `changes.create` / `changes.submit` / `changes.approve` / `changes.activate` / `changes.rollback`
- `credentials.read_metadata` / `credentials.manage`
- `audit.read` / `audit.read_sensitive`
- `security_settings.manage` — organization security policy (Phase 2)
- `jobs.read` / `jobs.manage` — background job visibility and enqueue/process (Phase 2)

## Approval workflow

Production-impacting changes use an explicit state machine:

```
DRAFT → PENDING_REVIEW → APPROVED → DEPLOYING → ACTIVE
              ↓              ↓
          REJECTED      SCHEDULED ──(cron)──→ DEPLOYING → ACTIVE
                              ↓
                         ROLLED_BACK (from ACTIVE)
```

Rules enforced in `src/lib/enterprise/change-workflow.ts`:

- **Self-approval denied** — requester cannot approve their own change.
- **Optimistic locking** — `expectedVersion` required on every transition.
- **Idempotency** — `Idempotency-Key` header on change creation deduplicates drafts.
- **Atomic activation** — deploy + activate runs in a single transaction.
- **Scheduled activation** — `schedule` action moves `APPROVED` → `SCHEDULED`; cron/worker activates when `scheduled_for <= now`.
- **Developers** may create/submit staging changes; production writes and approvals require owner/admin.

## Secret storage

| Asset | Storage | Exposure |
|-------|---------|----------|
| API keys (control plane) | SHA-256 hash + last4 in DB; optional `vault_ref` via `VAULT_PROVIDER` | Plaintext returned **once** on create/rotate only |
| Auth0 session secrets | Auth0 / sealed cookies | Never logged or exported |
| CTIX Open API keys (docs runner) | Memory-only in browser | Never in localStorage |

Vault providers (`src/lib/enterprise/vault-providers.ts`):

| Provider | Env vars | Behavior |
|----------|----------|----------|
| `env` | `VAULT_PROVIDER=env` | Development adapter (`EnvironmentSecretVault`) |
| `hashicorp` | `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_MOUNT_PATH` | HTTP KV API read/write |
| `aws` | `VAULT_PROVIDER=aws`, `AWS_REGION` | Uses `@aws-sdk/client-secrets-manager` when installed; otherwise stores `aws://` ref stub without network |

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

## Threat model (Phase 1–2)

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
| Cron endpoint abuse | `CONTROL_PLANE_CRON_SECRET` header required for unauthenticated processing |

## External infrastructure requirements

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres in production (SQLite acceptable locally) |
| `AUTH0_*` | Auth0 tenant, client, secret, domain (existing docs auth) |
| `CSRF_SIGNING_SECRET` or `AUTH0_SECRET` (32+ chars) | CSRF token signing |
| `INITIAL_OWNER_EMAIL` | Cold-start owner bootstrap (existing) |

### Optional (Phase 2)

| Variable | Purpose |
|----------|---------|
| `CONTROL_PLANE_CRON_SECRET` | Authenticates `POST /api/admin/control-plane/jobs/process` for schedulers |
| `VAULT_PROVIDER` | `env`, `hashicorp`, or `aws` — external API key storage |
| `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_MOUNT_PATH` | HashiCorp Vault configuration |
| `AWS_REGION` | AWS Secrets Manager region (requires optional SDK install for live calls) |

### Auth0 Organizations

- Enable Auth0 Organizations for multi-tenant deployments.
- Map the org ID into the session claim consumed as `session.claims.organizationId` (configured in Auth0 Actions/Rules).
- Enforce MFA for owner/admin/developer via Auth0 — session must include `amr` containing `mfa`, `otp`, `webauthn`, or `hwk`, or an `acr` value indicating MFA.

### Database migration

Run migrations on deploy (automatic on app start via `src/lib/db/migrations/index.ts`). Version 2 creates enterprise control-plane tables; version 3 adds `organization_security_settings` with Postgres RLS.

## API surface (Documentation Agent)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/control-plane/context` | `admin_dashboard.access` |
| GET/POST | `/api/admin/control-plane/resources` | read / write |
| GET/PATCH | `/api/admin/control-plane/resources/[id]` | read / write |
| GET/POST | `/api/admin/control-plane/resources/[id]/versions` | read / write |
| GET/POST | `/api/admin/control-plane/changes` | read / create |
| GET | `/api/admin/control-plane/changes/[id]` | read (diff vs active) |
| POST | `/api/admin/control-plane/changes/[id]/[action]` | submit/approve/reject/schedule/activate/rollback |
| GET/POST | `/api/admin/control-plane/credentials` | read_metadata / manage |
| POST | `/api/admin/control-plane/credentials/[id]/[action]` | rotate / revoke |
| GET/PATCH | `/api/admin/control-plane/security-settings` | `security_settings.manage` |
| GET/POST | `/api/admin/control-plane/jobs` | `jobs.read` / `jobs.manage` |
| POST | `/api/admin/control-plane/jobs/process` | cron secret or owner/admin `jobs.manage` |
| GET | `/api/admin/control-plane/audit` | `audit.read` |
| GET | `/api/admin/control-plane/export?kind=configuration\|audit` | read / audit.read |

Health endpoints (unauthenticated, listed in `proxy-auth.ts`): `/api/health/live`, `/api/health/ready`.

## UI entry points

- **APIs dashboard:** `/admin/documentation-agent/apis`
- **Security settings:** `/admin/documentation-agent/security`
- **Background jobs:** `/admin/documentation-agent/jobs`
- **Nav link:** App shell shows “Admin” when `/api/auth/me` reports `enterpriseCapabilities` includes `admin_dashboard.access`.

Sub-navigation shows only links the current principal may access.

## Phase 2 status — complete (Documentation Agent)

Phase 2 deliverables shipped:

- Public health endpoints for load balancers
- `schedule` change action + change detail/diff API
- Organization security settings (migration 003, API, UI)
- Background job repository, APIs, processor, and jobs UI
- Scheduled change activation via job processor
- Vault provider factory wired to API key creation
- Dashboard credential create/rotate/revoke with one-time plaintext modal
- Change diff viewer, schedule datetime picker, rollback version picker

### Remaining optional items

- **Redis-backed distributed rate limiting** — in-memory buckets are adequate for single-region serverless; Redis recommended for multi-instance hardening.
- **Full AWS SDK integration** — install `@aws-sdk/client-secrets-manager` in production for live AWS vault reads/writes; stub stores `vault_ref` when SDK absent.
- **Dedicated worker deployment** — Vercel cron can call `/api/admin/control-plane/jobs/process` with `CONTROL_PLANE_CRON_SECRET`; no separate worker process required.

## Operator checklist (production)

1. Set `DATABASE_URL` to managed Postgres.
2. Configure Auth0 Organizations and MFA for privileged roles.
3. Ensure org claim populates `session.claims.organizationId`.
4. Set `CSRF_SIGNING_SECRET` (or rely on `AUTH0_SECRET` if 32+ chars).
5. Set `CONTROL_PLANE_CRON_SECRET` and schedule cron to `POST /api/admin/control-plane/jobs/process` (e.g. every 5 minutes).
6. Optionally set `VAULT_PROVIDER` and provider-specific env vars for external secret storage.
7. Deploy and confirm `/api/health/ready` returns `{ status: "ready" }` without authentication.
8. Log in as owner with MFA → open `/admin/documentation-agent/apis`.
9. Verify viewer/doc_manager accounts receive forbidden state (no data leak).

## Security test coverage

Vitest covers policy matrix, CSRF, tenancy isolation, API key hashing, audit immutability/redaction, workflow self-approval denial, schedule action, security settings, background jobs, scheduled activation, health public paths, config diff sanitization, vault provider factory, SSRF redirect validation, mutation rate limits, MFA step-up helpers, and proxy-auth path classification. Playwright smoke tests cover admin forbidden state for viewers, owner dashboard/security/jobs load, and `noindex` headers.
