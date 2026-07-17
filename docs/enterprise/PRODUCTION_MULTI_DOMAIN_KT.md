# Production Multi-Domain — Knowledge Transfer Guide

## Architecture

One git repository → multiple Vercel projects (one per product) + optional admin project.

Each product Vercel project sets:
- `APP_PRODUCT_ID=ctix|cftr|csap|orchestrate`
- Product-specific env vars (see `.env.example`)

## How to add a new domain

1. Enable org flags: `admin_deployment_management`, `vercel_domain_automation`
2. Set server env: `VERCEL_TOKEN`, `VERCEL_TEAM_ID` (never in browser)
3. Admin → Deployments → Register Vercel project for product
4. Add domain → copy DNS records shown → configure DNS at registrar
5. Click **Check DNS** until propagated
6. Click **Verify** → wait for TLS active → workflow state **ready**
7. Only then mark production-ready

## How to diagnose DNS failure

- Admin → Deployments → domain row → **Check DNS**
- Compare expected CNAME/TXT in panel vs `dig` / DNS provider
- States: `dns_mismatch` = records wrong; `waiting_for_dns` = not propagated yet

## How to diagnose TLS failure

- After verify, check `tlsStatus` on domain row
- Confirm Vercel domain dashboard shows certificate active
- Retry **Verify** after DNS is correct

## How to verify collection assignment

- Deployment row shows **approved collection ID** from registry
- `APP_PRODUCT_ID` on Vercel project must match registered product
- Agent/search scoped to that product only on single-product deploys

## How to deploy one product project

1. Create Vercel project linked to same Git repo
2. Set `APP_PRODUCT_ID` and product env vars
3. Register project in Admin → Deployments
4. Attach and verify domain
5. Enable `DOMAIN_ROUTING_ENABLED` if using custom host on that project

## How to roll back

- **Domain:** Admin → Remove domain (disables mapping, removes from Vercel)
- **Deployment:** Vercel dashboard → promote previous deployment (audit in `deployment_audit_events`)
- **Flags:** Disable `admin_deployment_management`, `production_query_metrics` in Admin → Features

## Query metrics

- Enable `production_query_metrics` or `QUERY_ANALYTICS_ENABLED`
- Admin → Query analytics (logical queries vs attempts)
- Unanswered → Admin → Unanswered queries

## Rotate Vercel credentials

1. Create new token in Vercel → Account Settings → Tokens
2. Update `VERCEL_TOKEN` in Vercel project env (server only)
3. Revoke old token
4. No browser or git exposure

## Feature flags

Admin → Documentation Agent → Features:
- `multi_project_deployment`
- `vercel_domain_automation`
- `production_query_metrics`
- `admin_deployment_management`

## Product isolation check

- Visit product domain → confirm only that product in header/docs
- `GET /api/agent` with wrong `productId` on pinned deploy → 403 `PRODUCT_ISOLATION`

## Request / trace IDs

- Agent responses include `x-agent-request-id`
- Deployment audit events store `request_id`

## KT checklist

- [ ] Add domain end-to-end on staging
- [ ] Diagnose DNS mismatch
- [ ] Diagnose TLS pending
- [ ] Verify collection on deployment row
- [ ] Deploy one product Vercel project
- [ ] Roll back a domain
- [ ] Read query metrics dashboard
- [ ] Triage unanswered query
- [ ] Rotate Vercel token (staging)
- [ ] Toggle feature flags
- [ ] Confirm product isolation on pinned deploy
- [ ] Find request ID in audit events
