# Production Multi-Domain Vercel — Final Report

**Date:** 2026-07-16  
**Verdict:** READY WITH DOCUMENTED LIMITATIONS

| Area | Requirement | Status | Evidence | Limitation |
|------|-------------|--------|----------|------------|
| Multi-project model | One repo, per-product Vercel projects | ✅ | `APP_PRODUCT_ID`, `product_deployments` table | Projects not created in your Vercel account yet |
| Collection isolation | Approved Postman/docs collection per product | ✅ | `postman-collection-registry.ts`, validation on create | Live collection sync not automated |
| Vercel provider | Server-only adapter | ✅ | `vercel-provider.ts`, `fake-vercel-provider.ts` | Live API needs `VERCEL_TOKEN` |
| Admin domain automation | Add/verify/DNS/remove from admin | ✅ | Deployments page + `/api/admin/deployments` | Production requires MFA/change-request (future) |
| DNS checks | Server-side A/CNAME/TXT | ✅ | `dns/verify.ts` | Propagation delays operator-dependent |
| Metrics production | Server-side events, no prompt storage | ✅ | Existing analytics + org flag bridge | Enable `production_query_metrics` |
| Product isolation | Pinned deploy rejects other products | ✅ | `assertProductAccess`, agent 403 | Requires `APP_PRODUCT_ID` per project |
| RBAC | deployments.read/manage | ✅ | `enterprise/types.ts`, `policy.ts` | — |
| Tests | Fake provider + isolation tests | ✅ | 813 tests pass | No live Vercel in CI |
| KT docs | Operational runbook | ✅ | `PRODUCTION_MULTI_DOMAIN_KT.md` | — |
| Staging validation | Real hostnames + Auth0 | ⏳ | — | **Operator required** |

## Environment variable names (no values)

- `APP_PRODUCT_ID`, `APP_ENVIRONMENT`, `APP_CANONICAL_DOMAIN`
- `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROVIDER_FAKE`
- `DOMAIN_ROUTING_ENABLED`, `CTIX_DOMAIN`, … (existing)
- `SEARCH_INDEX_NAME`, `VECTOR_NAMESPACE`

## Rollback

Disable `admin_deployment_management` → remove domains via admin → revert Vercel deployment in dashboard. DB tables are additive (migration 007).
