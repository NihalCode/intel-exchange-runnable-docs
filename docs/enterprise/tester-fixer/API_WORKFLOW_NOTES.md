# API / workflow matrix notes (Phases 20–24)

## Authz

- Enterprise API routes use `guardEnterpriseApi(permission)` — MFA opt-in only (`requireMfa`).
- Full permission × role matrix covered by `src/lib/__tests__/enterprise-authz-matrix.test.ts` (100% of `ENTERPRISE_PERMISSIONS` decisions).
- Cross-tenant `organizationId` mismatch denied.

## Product isolation

- `resolveAppProductId` / `APP_PRODUCT_ID` pins single-product deploys.
- Pinecone namespaces: `product-ctix`, `product-csap`, `product-cftr`, `product-orchestrate`.
- BM25 local fallback remains when Pinecone unavailable (honest offline path).

## Runners / AI

- HTTP via `/api/run` + `assertPublicHost`.
- JS sandbox: iframe without `allow-same-origin`; fetch relayed to proxy.
- Secrets masked in runner output; SecretKey never in query/snippets.

## Support Agent

- Explicitly labeled non-production / illustrative until Zendesk workflows pass.
