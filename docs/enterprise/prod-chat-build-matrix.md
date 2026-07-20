# Production chat + Build App matrix

Generated: 2026-07-20  
Baseline commit (local at matrix write): `3fc9e04`  
Probes: `npm run auth:smoke -- --all`, `npm run prod:extreme-probe`

## ProductChatTarget

| Field | ctix | cftr | csap | orchestrate |
|---|---|---|---|---|
| canonicalDomain | `apitest1.cyninjadev.com` | `cyware-docs-cftr.vercel.app` | `cyware-docs-csap.vercel.app` | `cyware-docs-orchestrate.vercel.app` |
| vercelAlias | `cyware-docs-ctix.vercel.app` (308 → canonical) | same as canonical | same | same |
| appProductId | ctix | cftr | csap | orchestrate |
| collection | CTIX vendored pages + agent-index | CFTR Postman/pages | CSAP pages | Orchestrate pages |
| vectorNamespace | `product-ctix` (default when APP_PRODUCT_ID set) | `product-cftr` | `product-csap` | `product-orchestrate` |
| searchIndexName | Pinecone `cyware-api-docs` (env) | same index, namespaced | same | same |
| authReady | true (apitest1) | true | true | true |
| chatReady | gated Auth0 + `ask_agent` + org flag | same | same | same |
| analyticsReady | feature-flagged `QUERY_ANALYTICS_ENABLED` | same | same | same |

## Runtime evidence (Wave 0)

- `apitest1` `/api/health/ready` → ready, database + authConfig true, product ctix
- CFTR/CSAP/Orchestrate vercel `/api/health/ready` → ready
- `cyware-docs-ctix.vercel.app` → HTTP 308 to canonical (probe scripts updated to use apitest1)
- auth:smoke `--all` uses canonical hosts after fix

## Module inventory (chat)

| Layer | Files |
|---|---|
| Intent | `src/lib/agent/intent.ts` |
| Orchestrate | `src/lib/agent/orchestrate.ts` |
| Product scope | `src/lib/agent/product-scope.ts` |
| Normalize / retrieve | `normalize-query.ts`, `retrieve.ts`, `pinecone.ts` |
| Plan / citations | `planner.ts` |
| Snippet / style | `response-style.ts` |
| Safety | `safety.ts` |
| Chat UI | `agent-chat-state.tsx`, workspace clients |
| Analytics | query-analytics repository + agent route |

## Module inventory (Build App — real surface)

| Layer | Files |
|---|---|
| Blueprint | `app-builder.ts`, `app-builder-boilerplate.ts`, `app-builder-routes.ts`, `app-builder-css.ts` |
| Validate / policy | `validate-app.ts`, `generated-code-policy.ts` |
| Edit | `app-edit-rules.ts`, `edit-app.ts`, `repair-app.ts` |
| API | `/api/agent`, `/api/agent/deploy`, `/api/agent/zip`, `/api/agent/commit` |
| UI | `AgentProjectPanel.tsx`, `AgentAppBlueprintView.tsx` |

### Real Build App FSM

`idle → planning → blueprint_ready | failed` (+ client: `editing`, `deploying`, `deployed`, `zipped`)

**Not implemented:** preview worker, npm install in-product, idle→ready sandbox FSM.

## Probe command results

```text
auth:smoke --all → all four canonical hosts (after CTIX base URL fix)
prod:extreme-probe → CFTR/CSAP/Orchestrate green; CTIX alias 308 fixed by canonical host
```
