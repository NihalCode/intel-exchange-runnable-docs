# Build App architecture (real surface)

## State machine (implemented)

```text
idle → planning → blueprint_ready | failed
client overlays: editing | deploying | deployed | zipped
```

## Flow

1. User prompt matches build intent (`intent.ts` APP_SIGNAL) unless explain/snippet wins.
2. `POST /api/agent` with `mode: "app"` (feature flag `app_builder`).
3. RAG + `planAppFromRetrieval` → step results.
4. `generateAppBlueprint` → template Next.js files.
5. Client persists to `localStorage` (`saved-apps-client`).
6. Project panel: browse / zip / optional Vercel deploy / commit preview.

## Non-goals (documented limitations)

- No in-product `npm install` or preview worker
- No idle→ready sandbox FSM
- No package allowlist beyond fixed boilerplate dependencies
- Commit API returns preview message only (`committed: false`)
- Preview button sends an explain prompt; does not start a live app

## Security controls that do exist

- `validateAppFiles` + `generated-code-policy`
- Zip path traversal rejection
- Deploy pre-validate/repair
- Feature flags fail-closed per org
