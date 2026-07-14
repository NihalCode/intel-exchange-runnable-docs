# Phase 8: LLM Output Contracts

`src/lib/agent/llm-contract.ts` defines the versioned v1 boundary for workflow
plans returned by the model. It accepts only the plan fields the agent uses,
requires every step slug to be present in retrieved documentation, and rejects
unknown top-level or step fields.

The validator bounds workflow, explanation, question, parameter, body-depth,
and array/object sizes. It also validates the confidence range, step order, and
JSON value types before a plan can become an `AgentPlan`.

`planWithLlm` fails closed when JSON parsing or contract validation fails.
`runAgent` catches that failure and uses the deterministic retrieval planner;
therefore invalid model output cannot reach step code generation or the
execution UI. The LLM and embedding clients no longer include provider response
bodies in thrown errors. The public `AgentResponse` is assembled only after
this boundary and endpoint-specific validation.
