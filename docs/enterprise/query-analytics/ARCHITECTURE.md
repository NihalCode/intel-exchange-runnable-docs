# Query Analytics — Architecture & Metric Spec

Authoritative server-side Ask AI analytics for CTIX, CFTR, CSAP, and Orchestrate.

## Lifecycle

```text
user submits query
→ conversation + turn persisted (logical_query_id = turn_id)
→ attempt started (unique attempt_id)
→ product/hostname resolved server-side
→ retrieval + model run
→ terminal outcome classified (structured state only)
→ attempt completed + logical query finalized
→ projection row in query_analytics_events (compat)
→ unanswered review when outcome ∈ unanswered set
→ optional feedback / triage later
```

Cancel and agent error paths must finalize analytics the same way as success.

## Identities

| Concept | Identity | Notes |
|---|---|---|
| Logical query | `turn_id` when present, else server UUID | One intentional customer turn |
| Attempt | UUID (`attempt_id`) | Unique per `(organization_id, attempt_id)` |
| Explicit user retry | Same logical query, new attempt | Provider retries stay under same attempt |

Logical count increments only when a new turn is accepted. Double-click, reconnect, and idempotent duplicate submissions must not inflate logical counts. Admin outcome cards use **`query_logical_queries.terminal_outcome`** when present (with a latest-event fallback for projection-only rows); attempt totals still include every projection row so retries do not inflate answered/unanswered cards.

## Outcomes

```ts
type QueryOutcome =
  | "answered"
  | "partially_answered"
  | "no_verified_solution"
  | "no_results"
  | "clarification_required"
  | "access_blocked"
  | "credential_blocked"
  | "connector_unavailable"
  | "provider_error"
  | "system_error"
  | "cancelled";
```

Classification uses structured inputs only (guards, codes, retrievalEvidence, citation/retrieval counts, cancellation). Never English phrase parsing.

### Unanswered review queue

Insert only for: `no_verified_solution`, `no_results`, unresolved `clarification_required`, `provider_error`, `system_error`.

Do **not** queue: `answered`, `partially_answered`, `access_blocked`, `credential_blocked`, `connector_unavailable`, `cancelled`.

### Answer-quality denominator

```text
answered + partially_answered + no_verified_solution + no_results + clarification_required
```

Operational blocks and cancels are reported separately.

## Schema (migration 010+)

| Table | Role |
|---|---|
| `query_logical_queries` | One row per logical query; current terminal outcome |
| `query_attempts` | Immutable attempt history |
| `analytics_outbox` | Durable enqueue when sync materialization fails |
| `query_analytics_events` | Compatibility projection for admin summaries/exports |
| `unanswered_query_reviews` | Triage queue (+ encrypted query/IP columns) |

Constraints: unique `(organization_id, logical_query_id)`, unique `(organization_id, attempt_id)`, Postgres RLS FORCE.

## Privacy

- Exact unanswered query text and client IP: AES-256-GCM via `DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY`.
- Never embed unanswered text, upsert to Pinecone, or use as citations.
- Aggregate dashboards never show raw IP or full query.
- `query_analytics.read_sensitive` required for decrypt/sensitive export; audited.

## Permissions

| Role | Analytics read | Sensitive | Unanswered manage |
|---|---|---|---|
| owner / admin | yes | yes | yes |
| developer | yes (sanitized) | no | no |
| documentation_manager / viewer | no admin analytics | no | no |

## Feature flags

- `query_analytics` / `QUERY_ANALYTICS_ENABLED` — recording + admin page
- `unanswered_query_review` — triage UI
- `production_query_metrics` — production metric cards when enabled

## Pinecone boundary

Unanswered persistence is transactional DB only. Unit/static tests assert no Pinecone upsert/embed from unanswered paths.

## Reconciliation

```bash
npm run analytics:reconcile
npm run analytics:repair -- --dry-run
```

Repair defaults to dry-run; apply requires `--confirm` and writes audit.

## Rollback

1. Stop writing via feature flag off.
2. Migration 010 is additive; reverse by dropping new tables/columns after export (documented ops procedure — never auto-drop in prod).
3. Admin continues to read `query_analytics_events` projection during transition.

## Known pre-010 defects (fixed by this work)

- Success-path-only recording
- Non-idempotent event inserts
- Client-trusted turn IDs without ownership check
- `partially_answered` double-counted as unanswered
- No encrypted unanswered payload / unused `read_sensitive`
- No outbox or reconcile CLI
