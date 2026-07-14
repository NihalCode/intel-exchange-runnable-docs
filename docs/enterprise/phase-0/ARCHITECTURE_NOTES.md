# Architecture Notes (Phase 0)

## Stack (verified)

- Next.js 16.2.7 (App Router), React 19.2.4, TypeScript, Tailwind 4
- Auth0 (`@auth0/nextjs-auth0` ^4.24)
- Postgres (`pg`) production; `better-sqlite3` local/dev abstraction
- OpenAI REST (no official SDK pin), optional Pinecone
- Vitest + Playwright; **no** GitHub Actions workflows found
- Content: vendored JSON under `src/content/pages/`

## Data flows (as-built)

### Public documentation (intended)

```
User → /docs/[...] → SSG JSON pages → Markdown/EndpointView → CodeBlock
```

**Gap:** Proxy currently treats these as authenticated routes.

### Authenticated AI question

```
User → /agent (session)
  → POST /api/agent
  → guardAskAgent + product credential allowlist
  → expandQuery → retrieve (BM25 + optional Pinecone)
  → planWithLlm / rules → response JSON
  → client persists messages in localStorage
```

### Live API execution

```
HttpRunner → resolveStructured (creds in query) → POST /api/run
  → ENABLE_API_EXECUTION + assertPublicUrl/safeFetch → upstream
```

### Generated app deployment

```
Agent intent deploy → /api/agent/deploy (flag)
  → temp project → may inject ignoreBuildErrors → Vercel API
```

### Admin mutation

```
Admin UI → /api/admin/control-plane/* → org context + permissions
  → versioned resources / change requests / audit events
```

### Support Agent (current)

```
Admin nav → SupportAgentPages → MOCK_* constants → placeholder notice
(no Zendesk sync/index/search path)
```

## Persistence stores

| Data | Store |
|---|---|
| Users, invites, orgs, flags, control plane | Postgres / SQLite abstraction |
| Chat sessions / saved apps | Browser localStorage |
| Product credentials | Encrypted at rest (needs ENCRYPTION_KEY) |
| Secrets metadata | Enterprise vault provider or hash-only |
| Doc index | `agent-index.json` + Pinecone |
