# Production chat accuracy readiness

Status: **demo-ready for deterministic chat routing / retrieval / safety gates**
(Auth0-gated app; Support Agent off by default).

## Baseline

- Branch: `enterprise/chat-accuracy-validation` → merge to `main` for deploy
- Auth: whole app behind Auth0 except `/auth`, `/sign-in`, `/access`, `/invite`, `/post-login`, health
- Agent: Auth0 + per-product API credentials still required
- Support Agent / Zendesk: feature-flagged OFF (`support_agent`)

## Suites executed

| Suite | Location | Focus |
|---|---|---|
| Demo-critical | `scripts/chat-accuracy/cases/demo-critical.json` | Phase 18 demo prompts |
| CTIX | `ctix-suite.json` | Threat data, auth, no mass-delete invent |
| CFTR | `cftr-suite.json` | Incident details, conceptual |
| CSAP | `csap-suite.json` | Alerts + no fake assets endpoint |
| Orchestrate | `orchestrate-suite.json` | Playbook run / TS snippet |

Command: `npm run chat:accuracy`

## Fixes landed this pass

1. Conceptual “What is/does …” → `explain` intent (not app routing).
2. TypeScript/Python “Show/Give … language” → `snippet` intent.
3. “Fix export … after upgrade” no longer matches UI-edit “export” — stays `workflow` with a loaded app.
4. Fabrication / ignore-docs invent refusal covered by safety rails.
5. Zendesk queries fail-closed unless `support_agent` is enabled.
6. CSAP “list assets” treated as non-invent (no assets API in vendored docs).

## Production smoke (read-only)

After deploy, confirm:

- `/`, `/docs`, `/guides`, `/agent` → Auth0 redirect when logged out
- `/api/agent`, `/api/docs/search`, `/api/products` → 401 when unauthenticated
- Health endpoints → 200
- Authenticated chat: demo prompts stay product-correct; Zendesk remains unavailable copy

## Explicit non-goals / deferred

- Live authenticated multi-turn prod LLM scoring (needs dedicated test tenant session)
- Full Zendesk connector
- Destructive / write API exercise
- Weakening Auth0 or public docs (forbidden)
