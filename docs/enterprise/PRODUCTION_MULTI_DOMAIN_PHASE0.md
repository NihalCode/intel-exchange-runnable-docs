# Production Multi-Domain Vercel — Phase 0 Inspection

**Date:** 2026-07-16

## Current architecture

```text
GitHub (main) → single Vercel project → Next.js monolith
├── All 4 products in one build (path /docs/{product})
├── Host routing (optional, DOMAIN_ROUTING_ENABLED)
├── Admin at /admin on same origin (or ADMIN_DOMAIN rewrite)
└── Postgres/SQLite + Auth0 + optional Pinecone
```

## Product → collection map

| Product | Collection source | Content path |
|---------|-------------------|--------------|
| CTIX | Theneo MD | `src/content/pages/` |
| CSAP | Theneo MD | `src/content/products/csap/` |
| Orchestrate | Theneo MD | `src/content/products/orchestrate/` |
| CFTR | Postman collection `4787352` | `src/content/products/cftr/` |

## Current project → domain map

| Layer | Mechanism |
|-------|-----------|
| Runtime | Env: `CTIX_DOMAIN`, `CFTR_DOMAIN`, etc. + DB `domain_collection_mappings` |
| Vercel | Single project `intel-exchange-runnable-docs` |
| Per-product Vercel projects | **Not configured** (target state) |

## Metrics data flow (today)

```text
Agent POST /api/agent → classifyQueryOutcome → recordQueryAnalyticsEvent (flag-gated)
→ query_analytics_events → Admin query-analytics + unanswered pages
```

## Security risks (pre-implementation)

| Risk | Mitigation planned |
|------|-------------------|
| Vercel token in browser | Server-only provider adapter |
| Arbitrary project selection | Org-scoped DB + allowlisted team |
| Fake domain "verified" status | Vercel API + DNS probe required |
| Cross-product data leak | APP_PRODUCT_ID pin per deployment |
| Metrics double-count | logical_query_id dedup (existing) |

## Implementation plan

See `src/lib/deployment/` (Phases 1–3), migration 007, admin deployment APIs, KT doc.
