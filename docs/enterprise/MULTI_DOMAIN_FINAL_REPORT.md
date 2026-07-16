# Multi-Domain Implementation — Final Report

**Date:** 2026-07-16  
**Verdict:** NOT READY

## Summary

Phases 1–22 are implemented behind deployment feature gates. Phases 24–25 have unit coverage and a gated Playwright skeleton; full host/SSO E2E requires dedicated test hostnames. Staged rollout (Phase 26) must enable one product domain at a time.

## Root cause of repeated login

Same-origin API 401s redirected immediately without allowing Auth0 rolling-session cookies from middleware to reach the client. Fixed: `unauthorizedApiResponse` merges Set-Cookie; agent chat retries once on `SESSION_EXPIRED`.

## SSO topology

Optional central `AUTH_DOMAIN` with short-lived `auth_return_targets` (5 min TTL). Cross-domain sign-in stores return target; post-login redirects to product origin.

## Feature flags (env, default off)

- `DOMAIN_ROUTING_ENABLED`
- `SEPARATE_ADMIN_DOMAIN_ENABLED`
- `CROSS_DOMAIN_SSO_ENABLED`
- `QUERY_ANALYTICS_ENABLED`
- `CUSTOM_SNIPPET_QUERY_PARAMS_ENABLED`
- `CHAT_RESPONSE_NAVIGATION_ENABLED`

Client mirrors: `NEXT_PUBLIC_CUSTOM_SNIPPET_QUERY_PARAMS_ENABLED`, `NEXT_PUBLIC_CHAT_RESPONSE_NAVIGATION_ENABLED`.

## Product domains (env)

`CTIX_DOMAIN`, `CFTR_DOMAIN`, `CSAP_DOMAIN`, `ORCHESTRATE_DOMAIN`, `ADMIN_DOMAIN`, `AUTH_DOMAIN`

## Rollback

Set all feature gates to `false` and redeploy. Migration 006 is additive; no rollback SQL required for emergency disable.

## Remaining limitations

- Cross-domain SSO not validated on production hostnames
- Domain CRUD UI is read-only table (API available)
- Playwright multi-domain suite is feature-gated skeleton
- Org DB feature flags not yet bridged to env gates (Phase 21 partial)
