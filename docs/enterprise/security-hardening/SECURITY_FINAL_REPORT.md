# Security Hardening — Final Report

## Ship baseline

From Program 1 production SHA `f221c06` (all four products authReady).

Branch: `enterprise/security-hardening`.

## Threat model

See `THREAT_MODEL.md` + DFD. Auth model preserved: one login, MFA only for sensitive privileged ops.

## Fixes delivered

| ID | Fix |
|---|---|
| SEC-001 | CSRF on unanswered-queries PATCH + UI token |
| SEC-002 | CSRF on jobs/process session path (cron secret unchanged) |
| SEC-003 | CSRF on product ingest when Auth0 enabled |
| SEC-004 | `safeZipEntryPath` blocks zip-slip / absolute paths |
| SEC-005 | CSP `upgrade-insecure-requests` + global Permissions-Policy |
| Suite | `security-suite.test.ts` consolidates XSS/zip/authz/spawn/secret canaries |
| Ops | `INCIDENT_RESPONSE.md` rollback + Neon PITR notes |

## Release gate (local)

- typecheck / lint `--max-warnings=0` / vitest / health:check / secrets scan / build
- e2e previously green on Program 1; re-run at ship
- `npm audit --omit=dev`: 2 moderate (Next nested postcss) — **accepted**, do not force-downgrade Next

## Residual risk

- Agent chat POST routes still rely on session + SameSite cookies (enterprise CSRF cookie not wired into agent client)
- Support Agent remains non-production / illustrative
- External Codeflow rescan still required for score movement

## Security fail conditions

None of the hard fail conditions remain open for confirmed production paths covered in this program (no untrusted HTML sinks, no shell spawn, no open CSRF on patched admin mutations, no zip-slip in archive generation, SSRF allowlist intact).
