# Phase 17: AI Regression Fixtures

`src/lib/__tests__/agent-eval-corpus.test.ts` is the versioned, deterministic
golden corpus for high-risk agent behavior. The current corpus version is `v1`.
It uses pure routing, product-scoping, answer-UX, and LLM-contract helpers, so
it does not require provider credentials, network access, or mutable fixtures.

## v1 coverage

- Conceptual CTIX questions and API troubleshooting stay in workflow mode even
  when an application is loaded.
- Explicit `app/page.tsx` requests route to an existing-app edit.
- A named CFTR query overrides a conflicting product selector.
- CTIX/Orchestrate comparison queries retain multi-product retrieval scope.
- Coarse evidence labels and degraded-retrieval notices map to safe
  user-visible copy.
- The LLM plan contract rejects malformed, oversized workflow, and oversized
  step-array payloads before they can reach executable plan generation.

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
