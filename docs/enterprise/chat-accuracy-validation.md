# Chat accuracy validation

The demo-critical harness is a deterministic regression suite for chat routing,
product scope, endpoint retrieval, feature gating, and instruction-override
refusal. It reads only the vendored documentation and local agent helpers; it
does not invoke a live tenant or perform API writes.

## Run the source manifest

```bash
npm run chat:manifest
```

This produces `artifacts/chat-accuracy/api-manifest.json`. The inventory is
deduplicated by product, method, and normalized path, and fails if CTIX, CFTR,
CSAP, or Orchestrate has no documented endpoints.

## Run the demo-critical suite

```bash
npm test -- chat-accuracy
```

The suite regenerates the API manifest, evaluates the 20 versioned fixtures in
`scripts/chat-accuracy/cases/demo-critical.json`, and writes:

- `artifacts/chat-accuracy/demo-critical-report.json`
- `artifacts/chat-accuracy/DEMO_REPORT.md`

For the combined local command, run:

```bash
npm run chat:accuracy
```

The harness validates deterministic boundaries rather than live model quality.
Production chat smoke tests remain a separate, authenticated, read-only check;
never use this suite to issue mutating requests.
