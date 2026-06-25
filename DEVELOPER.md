# Developer Guide — Documentation Agent

This project separates **public documentation clients** from **developer/admin workflows**.

## What works without credentials (normal clients)

- Browse all product docs (`/docs/…`)
- Ask the **Documentation Agent** (`/agent`) planning questions
- View generated **cURL, Python, JavaScript** examples with **placeholders only**
- Copy example requests — no Access ID / Secret Key required

Public mode is the **default**: `NEXT_PUBLIC_ENABLE_LIVE_API_UI` is not set.

## What requires developer credentials

| Workflow | Requires |
|----------|----------|
| Import / update Postman collection | `DEVELOPER_ACCESS_TOKEN` + `DEV_CYWARE_{PRODUCT}_*` env vars |
| Re-ingest product docs via API | Same |
| Live API execution (`Run` button) | `NEXT_PUBLIC_ENABLE_LIVE_API_UI=true` + client creds in API Settings |
| Server-side live validation | `ENABLE_API_EXECUTION=true` + developer env credentials |

Normal users are **never** asked for credentials in public documentation mode.

---

## Environment variables (placeholders only in `.env.example`)

Copy `.env.example` → `.env.local` and fill in on the server:

```bash
# Developer gate for Postman import / diagnostics API
DEVELOPER_ACCESS_TOKEN=

# Per-product server credentials (never exposed to browsers)
DEV_CYWARE_CTIX_BASE_URL=
DEV_CYWARE_CTIX_ACCESS_ID=
DEV_CYWARE_CTIX_SECRET_KEY=

DEV_CYWARE_CFTR_BASE_URL=
DEV_CYWARE_CFTR_ACCESS_ID=
DEV_CYWARE_CFTR_SECRET_KEY=

DEV_CYWARE_CSAP_BASE_URL=
DEV_CYWARE_CSAP_ACCESS_ID=
DEV_CYWARE_CSAP_SECRET_KEY=

DEV_CYWARE_ORCHESTRATE_BASE_URL=
DEV_CYWARE_ORCHESTRATE_ACCESS_ID=
DEV_CYWARE_ORCHESTRATE_SECRET_KEY=

# Enable live Run button in the main UI (developer testing)
NEXT_PUBLIC_ENABLE_LIVE_API_UI=true

# Allow /api/run to forward to live tenants
ENABLE_API_EXECUTION=true
```

---

## Developer Console

Open **`/developer`** (not linked for normal users except a small “Developer Console” link in docs mode).

1. Enter `DEVELOPER_ACCESS_TOKEN` (saved in session storage only).
2. **Run diagnostics** — missing credentials, index status, blockers.
3. **Validate endpoints** — static snippet/path checks for all products; optional live GET probes.
4. **Import Postman collection**:
   - Select product (CTIX, CFTR, CSAP, Orchestrate)
   - Paste Postman Collection v2.1 JSON
   - **Preview parse** — no write
   - **Import & write docs** — writes `src/content/products/{id}/pages/` and manifest

Import is **blocked** until server-side developer credentials for that product are configured.

---

## CLI: ingest Postman collection

```bash
# From hosted URL (CFTR default in products-config.mjs)
npm run ingest -- --product=cftr

# From local file (developer workflow)
node scripts/ingest.mjs --product=cftr --collection-file=./path/to/collection.json

# Developer Console import uses the TypeScript parser via --parser=ts (automatic).
# CLI defaults to the legacy JavaScript parser; opt in with:
node scripts/ingest.mjs --product=cftr --collection-file=./collection.json --parser=ts

# Rebuild agent index after ingest
npm run build:index -- --product=cftr
```

---

## Add a new API product

1. Add entry to `src/lib/products/registry.ts` and `scripts/products-config.mjs`
2. Set `DEV_CYWARE_{PRODUCT}_*` credentials in `.env.local`
3. Import Postman collection via Developer Console or CLI
4. Run `npm run build:index -- --product={id}`
5. Optional: `npm run build:index` then `npm run pinecone:upsert` (indexes all products)

---

## Postman parser (`src/lib/postman/`)

Parses:

- Collection / folder / request names
- HTTP method, path, query, headers, body
- Collection-, folder-, and request-level auth inheritance
- Saved response examples
- Credential placeholder names (`{{API_KEY}}`, Cyware Open API params)

Output: internal `EndpointPage`-compatible JSON + `postmanMeta` (auth, runnable status).

---

## Endpoint runnable status

| Status | Meaning |
|--------|---------|
| `docs_only_available` | Public documentation + placeholders |
| `runnable_with_developer_credentials` | Live run when dev creds + live UI enabled |
| `blocked_missing_credentials` | Server dev env vars missing |
| `blocked_missing_developer_access` | `DEVELOPER_ACCESS_TOKEN` not configured |

---

## Tests

```bash
npm test -- src/lib/__tests__/postman-parse-collection.test.ts
npm test -- src/lib/__tests__/developer-workflows.test.ts
```

---

## Security

- Never commit `.env.local` or real keys
- Generated snippets use `<ACCESS_ID>`, `<BASE_URL>`, etc.
- Developer token only on `/api/developer/*` routes
- `/api/products/*/ingest` requires developer token
- `/api/run` returns 403 when `ENABLE_API_EXECUTION` is not `true`
