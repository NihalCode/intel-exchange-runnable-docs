# Security finding ledger (Program 2)

| ID | Category | Severity | Classification | Status | Notes |
|---|---|---|---|---|---|
| SEC-001 | CSRF | high | confirmed_defect | fixed | unanswered-queries PATCH lacked CSRF |
| SEC-002 | CSRF | high | confirmed_defect | fixed | jobs/process session path lacked CSRF (cron secret OK) |
| SEC-003 | CSRF | medium | confirmed_defect | fixed | product ingest when Auth0 enabled lacked CSRF |
| SEC-004 | Zip slip | high | confirmed_defect | fixed | agent zip accepted `../` paths — `safeZipEntryPath` |
| SEC-005 | CSP | medium | confirmed_architecture_issue | fixed | added upgrade-insecure-requests + Permissions-Policy |
| SEC-006 | XSS | medium | safe_by_design | fixed | Program 1 removed DSI sinks |
| SEC-007 | Command | high | safe_by_design | accepted | ingest spawn execPath+argv |
| SEC-008 | SSRF | high | safe_by_design | verified | assertPublicUrl + product allowlist |
| SEC-009 | Authz | high | confirmed_test_gap | fixed | full ENTERPRISE_PERMISSIONS matrix |
| SEC-010 | Supply chain | medium | accepted | accepted | Next nested postcss moderate — force-fix breaks Next |
| SEC-011 | npm audit | medium | accepted | accepted | Do not downgrade Next via audit fix --force |

## Inventories (paths)

- Routes: 59 under `src/app/api`
- Permissions: `ENTERPRISE_PERMISSIONS` + documentation permissions
- Outbound: `/api/run` → `assertPublicUrl` + product patterns
- Raw HTML: none in production after Program 1
- Command exec: `ingest-runtime.ts` only
- AI tools: agent orchestrate/planner; product-scoped Pinecone namespaces
