# Cyware API Docs — Runnable Reference

> **Developer handoff:** start with [`DEVELOPER_HANDOFF.md`](./DEVELOPER_HANDOFF.md) — setup, env vars, cloud services, auth, and a detailed guide to every app/admin tab.

An unofficial, **runnable** documentation platform for Cyware product APIs. Browse docs, search with natural language, generate runnable code snippets, and test API calls in the browser.

## Supported products

| Product | Docs source | Route prefix |
|---------|-------------|--------------|
| **CTIX / Intel Exchange** | [Theneo](https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference) | `/docs/ctix/…` (legacy `/docs/…` also works) |
| **CSAP (Collaborate)** | [Theneo](https://csapapi.cyware.com/) | `/docs/csap/…` |
| **Cyware Orchestrate** | [Theneo](https://orchestrateapi.cyware.com/cyware-orchestrate-api-reference-theneo) | `/docs/orchestrate/…` |
| **CFTR** | [Postman](https://cftrapi.cyware.com/) | `/docs/cftr/…` |

Use the **Product** selector in the header to switch APIs. Set **Search** to *All products* for cross-product doc search in the AI agent.

## Features

- **Multi-product** — one app for CTIX, CSAP, Orchestrate, and CFTR with product-specific auth and base URLs.
- **Central code renderer** — every snippet flows through `CodeBlock` (`src/components/CodeBlock.tsx`).
- **Run controls** — cURL/HTTP via `/api/run` proxy; JavaScript in sandboxed iframe; Python via Pyodide.
- **AI agent** (`/agent`) — RAG over all indexed docs; infers product from your question or asks when ambiguous.
- **Security** — mutating methods require confirmation; secrets masked; SSRF protection on the proxy.

## Environment variables

Copy `.env.example` → `.env.local`:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | **Server-side only** — agent chat, embeddings, app edits (never `NEXT_PUBLIC_`) |
| `OPENAI_MODEL` | Chat model (default: `gpt-4o-mini`) |
| `OPENAI_EMBEDDING_MODEL` | Embedding model (default: `text-embedding-3-small`) |
| `PINECONE_API_KEY` | Optional vector retrieval (falls back to local BM25) |
| `PINECONE_INDEX` | Pinecone index name (default: `cyware-api-docs`) |
| `DEFAULT_PRODUCT_ID` | Default product in UI (default: `ctix`) |
| `ENABLE_API_EXECUTION` | Enable live API execution (optional) |
| `MAX_CRAWL_PAGES` | Limit pages during ingest (optional) |
| `DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY` | Required base64 32-byte AES-256-GCM key for per-user product secrets |
| `AUTH0_OKTA_CONNECTION` | Required — Okta Workforce enterprise connection name (Auth0 thin broker) |
| `OKTA_ORG_URL` / `OKTA_API_TOKEN` | Okta Users API for Add user provisioning |
| `OKTA_DOCS_GROUP_ID` | Preferred — Cyware Docs Users group id (`00g…`) |

All application routes are Auth0 protected. The Documentation Agent additionally requires one
currently valid per-user connection to CTIX, CFTR, Orchestrate, or CSAP. Users configure these
only at `/authentication`; raw secrets are encrypted server-side and never stored in browser
storage or returned by metadata APIs.

## Enterprise documentation lifecycle

- `/admin/documentation-agent/schemas` accepts OpenAPI 3 JSON/YAML, Postman JSON, legacy
  Theneo input, and GraphQL SDL. Validation, deterministic preview, structural diff, review,
  approval, and idempotent publication are organization scoped.
- Developers can upload, validate, preview, and submit. Only admins or owners can approve and
  publish, and authors cannot approve their own versions.
- `/admin/documentation-agent/features` controls runtime capabilities. Builder, project,
  deployment, import, commit, download, preview, and API-console flags default off and are
  enforced by backend routes.
- `/admin/documentation-agent/users` provisions users directly through Auth0 Management API;
  setup remains provider managed and setup ticket URLs are not exposed.

## Content pipeline

Docs are vendored locally as JSON under `src/content/`:

```bash
# Ingest one product
npm run ingest -- --product=csap
npm run ingest -- --product=orchestrate
npm run ingest -- --product=cftr
npm run ingest -- --product=ctix   # default

# Ingest all products
npm run ingest:all

# Build local search indexes (BM25)
npm run build:index

# Optional: upsert to Pinecone
npm run pinecone:upsert
```

**Re-index via API** (dev/admin):

```bash
curl -X POST http://localhost:3000/api/products/csap/ingest
```

Theneo exports require a browser-like `Referer` header (handled automatically by the ingest script).

### Adding a new Cyware API product

1. Add an entry to `scripts/products-config.mjs` and `src/lib/products/registry.ts`.
2. Run `npm run ingest -- --product=<id>`.
3. Run `npm run build:index -- --product=<id>`.
4. The product appears in the header selector automatically.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Test & build

```bash
npm test
npx tsc --noEmit
npm run build
npm run start
```

## Example agent queries

- *How do I create an incident in CSAP?*
- *For Orchestrate, generate the API call for creating a playbook.*
- *Which CFTR endpoint retrieves reports?*
- *Search all Cyware APIs for endpoints related to indicators.*
- *Give me Python code for this Orchestrate API call.*

## Troubleshooting ingestion

| Issue | Fix |
|-------|-----|
| `403 Forbidden` on `llms.txt` | Re-run ingest; script sends `Referer` header. Some networks may block automated fetch. |
| Empty product nav | Run ingest for that product; check `src/content/products/<id>/manifest.json`. |
| Agent returns wrong product | Name the product in your question, or use the Product selector + *This product* search scope. |
| CTIX broken after upgrade | Legacy routes `/docs/<slug>` still map to CTIX; use `/docs/ctix/<slug>` for explicit product paths. |

## Deploy (Vercel)

Standard Next.js deploy; set env vars in Vercel project settings. Doc pages are statically generated per product.

Four product projects share this repo (`cyware-docs-ctix|cftr|csap|orchestrate`). See [`DEVELOPER_HANDOFF.md`](./DEVELOPER_HANDOFF.md) §10 for multi-product env, Auth0 URL allowlists, and Hobby quota notes.
