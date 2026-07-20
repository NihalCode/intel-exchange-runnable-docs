# Master inventory (Phase 0)

Counts from Wave A scan of the checked-out tree.

| Surface | Count | Location |
|---|---|---|
| App pages (`page.tsx`) | 58 | `src/app/**/page.tsx` |
| API routes (`route.ts`) | 59 | `src/app/api/**/route.ts` |
| DB migrations | 8 (+ index) | `src/lib/db/migrations/001`–`008` |
| Vitest suites | 113 files / 853 tests | `src/lib/__tests__` |
| Products | 4 | CTIX, CSAP, CFTR, Orchestrate |
| Roles (documented) | owner, admin, documentation_manager, developer, viewer | enterprise auth |

## Admin panes (documentation-agent)

Dashboard, users, deployments, domains, features, query-analytics, unanswered, APIs, schemas, sync-jobs, sources, change-requests, authentication, keys, jobs, settings, audit-logs, environments, webhooks.

## Support Agent panes

Present in nav; treat as **non-production** unless real Zendesk workflows pass (honest labeling required).

## Security sinks (production `src/`)

| Sink | Sites | Classification |
|---|---|---|
| `dangerouslySetInnerHTML` | `layout.tsx` (theme), `CodeBlock.tsx` (hljs) | Accepted intentional_safe; polish Wave B |
| `child_process.spawn` | `ingest-runtime.ts` only | Safe-by-design (execPath + argv, no shell) |
| `eval` / `Function` | None in app source | FP in analyzer tests only |
| SQL | Parameterized via `db` helpers | Review ongoing |

## Large files (health long-file info)

Dashboard, ApisPage, agent-chat-state, RequestPlayground, runners, mock-data, app-builder, app-edit-rules, orchestrate, planner, db/client, db/repository, session, change-workflow, enterprise/repository.
