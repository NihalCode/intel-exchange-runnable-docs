# Incident response & rollback

## Detection

- Vercel deployment / function error alerts
- Auth0 log streaming (failed logins, MFA failures)
- `npm run health:check` in CI (open critical/high)
- `npm run security:scan-secrets` on every PR
- Production setup-status `commitSha` mismatch vs expected release

## Containment

1. Rotate compromised secrets (Auth0, `DATABASE_URL`, `VERCEL_TOKEN`, OpenAI, Pinecone, CSRF signing).
2. Disable suspicious users (`users/[id]/disable`) with MFA-gated admin where configured.
3. Freeze domain mutations (require dual approval; no self-approve on production).

## Rollback

```bash
git revert <bad-sha>
git push origin main
# Redeploy all four products to the prior known-good SHA
npx vercel link --yes --project cyware-docs-ctix --scope nihalcodes-projects
npx vercel --prod --yes
# repeat for cyware-docs-csap, cyware-docs-cftr, cyware-docs-orchestrate
```

Verify each product: `GET /api/auth/setup-status` → `deployment.commitSha`.

## Backup / recovery

- Postgres: Neon point-in-time restore (project dashboard); record PITR window in ops runbook.
- Content: vendored `src/content/` + git history; re-ingest from Postman/Theneo if corrupted.
- Vector: `npm run pinecone:upsert` into product namespaces after content restore.

## Proven rollback SHA (Program 1 ship)

`f221c06` — tester/fixer ship with XSS sinks removed and health:check green.
