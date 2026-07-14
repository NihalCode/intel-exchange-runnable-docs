# Chat accuracy validation

The chat accuracy harness is a deterministic regression suite for chat routing,
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

## Run the suites

```bash
npm test -- chat-accuracy
# or
npm run chat:accuracy
```

Fixtures live under `scripts/chat-accuracy/cases/`:

- `demo-critical.json` — Phase 18 demo prompts (auth override, refusal, Zendesk gate)
- `ctix-suite.json` / `cftr-suite.json` / `csap-suite.json` / `orchestrate-suite.json`

Artifacts (gitignored):

- `artifacts/chat-accuracy/api-manifest.json`
- `artifacts/chat-accuracy/demo-critical-report.json`
- `artifacts/chat-accuracy/DEMO_REPORT.md`

## Product notes from validation

- CSAP documentation in this repo covers alerts/Collaborate APIs. There is no
  documented “list assets” endpoint; the harness asserts the agent must not
  invent `GET /v1/assets`. Prefer “list CSAP alerts” for grounded demos.
- Zendesk / Support Agent remains fail-closed while `support_agent` is off
  (default).
- Prompt-injection invent/fabricate requests are refused without retrieval.

Production chat smoke remains a separate Auth0-authenticated, read-only check.
Docs remain behind Auth0; the agent still requires per-product API credentials.
