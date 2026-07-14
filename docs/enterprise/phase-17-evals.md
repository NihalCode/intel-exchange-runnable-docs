# Phase 17: AI Regression Fixtures

`src/lib/__tests__/agent-eval-corpus.test.ts` is the versioned, deterministic
golden corpus for high-risk agent behavior. The current corpus version is `v2`.
It uses pure routing, product-scoping, answer-UX, and LLM-contract helpers, so
it does not require provider credentials, network access, or mutable fixtures.

## v2 coverage

- Conceptual CTIX questions and API troubleshooting stay in workflow mode even
  when an application is loaded.
- Explicit `app/page.tsx` requests route to an existing-app edit.
- A named CFTR query overrides a conflicting product selector.
- CTIX/CFTR authentication comparison queries retain multi-product retrieval
  scope and use the all-product retrieval filter.
- Disconnected-product queries produce the shared `PRODUCT_NOT_AUTHORIZED`
  response without creating executable steps.
- Coarse evidence labels and degraded-retrieval notices map to safe
  user-visible copy; primary evidence labels never expose raw percentages.
- The local lexical fixture ranks the exact Ping endpoint for both `ping` and
  `GET /ping/` queries.
- The LLM plan contract rejects malformed payloads, unknown model-produced
  fields, invalid endpoint slugs, invalid confidence values, oversized
  workflows, and oversized step arrays before they reach executable planning.

## Running the corpus

```bash
npm test -- agent-eval-corpus.test.ts
```

The full release gate remains:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Remaining evaluation work

The fixtures provide regression protection for deterministic boundaries. Before
model changes are production-ready, define representative retrieval and
end-to-end planning datasets, measure them against versioned release
thresholds, and record results for each candidate model or prompt change.
