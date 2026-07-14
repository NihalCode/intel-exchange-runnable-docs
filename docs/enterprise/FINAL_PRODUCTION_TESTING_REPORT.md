# Final production testing report

Status: **demo-ready** for Auth0-gated production (Support Agent / Zendesk remain fail-closed).

## Baseline (pre-change)

| Field | Value |
|---|---|
| Prior production SHA | `aa6bc50` |
| This release SHA | `286dcb6` |
| Deployment ID | `dpl_3dQ4f1vvYmk55rZqMzFUvQ6MBCsN` |
| Production URL | https://intel-exchange-runnable-docs.vercel.app |
| Health `/api/health/ready` | `200` `{ database: true, authConfig: true }` |
| Auth gate | Docs + agent require Auth0; public auth pages only |
| Feature `support_agent` | **OFF** (default) |
| Feature `placeholder_admin_modules` | **OFF** |
| Environment | production (Vercel `iad1`) |

## What was validated

Deterministic harness suites (`npm run chat:accuracy` / vitest `chat-accuracy`):

- Demo-critical (24 prompts including secret injection, no-match, deploy-playbook collision, typo 401)
- CTIX / CFTR / CSAP / Orchestrate product suites
- Intent-collision suite (deploy playbook ≠ app deploy; search support → gated)
- Security suite (fabricate, guess, secret reveal, permission/tenant override)

Also covered by unit/e2e gates:

- Duplicate final message idempotency + turn cancel (conversation store)
- Auth0 redirects / API 401 when logged out (prod smoke)
- Secret scan, typecheck, lint, full unit suite, Playwright e2e, production build

## Root-cause fixes this pass

| Issue | Layer | Fix | Regression |
|---|---|---|---|
| `deploy the playbook` routed to app `deploy` | Intent | Deploy/commit require app/git/vercel context | intent-collision suite |
| Secret / poisoned-doc key exfil | Safety + orchestrate | Early `secret_refusal` | security + demo-21 |
| Permission/tenant override injections | Safety | `side_effect_refusal` | security suite |
| Playbook prompts not scoped to Orchestrate | Product scope | `playbook(s)` → orchestrate inference | demo-23 |
| Bare “search support” missed Zendesk gate | Safety | Match `search support` | collision-search-support |
| Cancel mid-turn left underexercised | Conversation store | Cancel test (no final) | conversation-store |

## Explicit non-claims / remaining risks

- Live authenticated multi-turn LLM scoring in production was not executed (needs dedicated test tenant session + credentials). Deterministic routing/retrieval/safety gates are green.
- Full Zendesk connector remains disabled — correct unavailable state shown; no mock tickets.
- CSAP has **no** documented assets API; harness asserts non-invention for “list CSAP assets”.
- SSE streaming transport is partially reserved; duplicate finals already prevented at store completion.

## Release gates

Commands:

```bash
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm ci
npm run typecheck
npx eslint . --max-warnings=0
npm test
$env:AUTH_DISABLED='true'; npm run test:e2e
npm run build
npm run security:scan-secrets
npm run chat:accuracy
```

Results (this release):

| Gate | Result |
|---|---|
| `npm ci` | OK |
| typecheck | OK |
| eslint `--max-warnings=0` | OK |
| secret scan | OK |
| unit tests | **649** passed |
| chat accuracy | **45** passed (manifest + suites) |
| Playwright e2e | **13** passed |
| `next build` | OK (1530 pages) |
| `npm audit --omit=dev` | 2 moderate (Next nested `postcss` XSS); force-fix downgrades Next — **not applied** |

## Rollback

```bash
git revert <merge-or-commit-sha>
git push origin main
npx vercel --prod --yes
```

Prior known-good SHA: `aa6bc50`.

## Demo checklist

- [x] Auth0 gate intact (no public docs)
- [x] Agent credential gating unchanged
- [x] Demo-critical suite green locally
- [x] Zendesk unavailable (feature off)
- [x] Fabrication / secret injection refuse
- [x] Product override CFTR over CTIX selector
- [x] Production smoke Auth redirects + health
- [x] Release gates green; explicit prod deploy
