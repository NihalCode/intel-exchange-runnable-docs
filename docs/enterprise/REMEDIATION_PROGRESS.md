# Enterprise Remediation Progress

This branch (`enterprise/phase-0-intake`) is intentionally unpushed.

## Completed work

- **Phase 0 — intake and baseline:** documented the architecture, feature
  inventory, route-access matrix, threat model, remediation sequence, baseline
  checks, and secret-scan tooling.
- **Phases 1–2 — access control and enterprise control plane:** added the
  administrative control plane and Documentation Agent platform; tightened
  public-route allowlists and product API authorization boundaries.
- **Phases 3–5 — product scoping and durable conversations:** scoped agent
  retrieval to each user's connected products and added server-backed
  conversation and turn persistence.
- **Phases 6–7 — fail-closed storage and retrieval resilience:** gated mock
  administrative integrations, failed closed on unavailable vault storage, and
  added hybrid retrieval with visible degraded-mode evidence.
- **Phase 8 — LLM contracts:** introduced a strict, versioned workflow-plan
  contract that bounds model output and falls back to deterministic planning on
  malformed output.
- **Phase 9 — answer UX:** consolidated responses into a final-answer card and
  surfaced evidence/degraded retrieval status without exposing internal
  diagnostics.
- **Phase 13 — API runner hardening:** restricted execution to approved product
  destinations and added DNS-aware SSRF protections with redirect validation.
- **Phase 19 — CI quality gates:** added CI checks for secret scanning,
  zero-warning linting, type checking, tests, and production builds.

## Remaining gaps

- **Support Zendesk integration remains gated** pending production credentials
  and an approved support workflow.
- **Streaming/SSE is incomplete;** agent responses still use request/response
  delivery rather than a hardened streaming contract.
- **RLS and MFA are incomplete;** MFA is currently optional for the
  administrative dashboard and database row-level enforcement needs production
  rollout work.
- **Accessibility needs a dedicated pass,** including keyboard navigation,
  focus management, labels, and automated a11y coverage.
- **Evaluation gates are incomplete:** add representative retrieval/planning
  evals and release thresholds before treating model changes as production
  ready.
