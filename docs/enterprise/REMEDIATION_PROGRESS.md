# Enterprise Remediation Progress

Active on `main`. Documentation app is **Auth0-gated** (docs are not public).
AI agent remains credential-gated per product after login.

## Completed work

- Phase 0 intake, baselines, secret-scan / archive allowlist
- Auth0 + role/capability control plane; docs/layouts Auth0-gated
- Agent product credential scoping + Authentication UI
- Vault fail-closed; mock Support Agent / placeholder admin modules default-off
- Deploy quality-gate enforcement (no ignoreBuildErrors)
- Intent routing hardened (docs/404 ≠ app edit)
- Server conversation/turn persistence + client wire-up + Stop/cancel
- Agent request correlation header (`x-agent-request-id`) and turn-final persistence
- Typed agent lifecycle-event vocabulary, ready for a later SSE transport
- Hybrid retrieval + degraded evidence UX + LLM plan contracts
- API runner SSRF injectable DNS + destination checks
- Focused a11y (skip link, landmarks, live regions, focus trap)
- Phase 17 deterministic chat-accuracy corpus expanded (routing, product scope
  and credential denials, evidence copy, LLM contract, exact lexical ranking);
  CI workflow (lint/typecheck/test/build/secret-scan)

## Remaining / deferred

- Full Zendesk Support Agent (feature remains default-off)
- Full SSE streaming protocol (deferred): the agent currently returns one JSON
  response. `src/lib/agent/events.ts` defines the typed lifecycle events for a
  future SSE transport; cancellation still aborts the browser request and marks
  a persisted turn cancelled when one exists.
- Postgres RLS rollout + mandatory MFA for all sensitive admin ops
- Broader screen-reader / a11y regression suite
- Eval release thresholds & canary for model/index changes

## Explicit product overrides

- **Docs are NOT public** until product asks to reopen Phase 2 public allowlist.
- **AI agent requires Auth0 + valid product credentials** before asking.

## Remaining gate inventory

| Gate | Default | Status / rollout condition |
|---|---|---|
| `ADMIN_REQUIRE_MFA` | false / unset | Optional admin-layout step-up. Enable only after the production Auth0 tenant reliably emits MFA `amr`/`acr` claims; it is not force-enabled by deployment. |
| `support_agent` | OFF | Zendesk-backed Support Agent is deferred pending Zendesk integration. |
| `placeholder_admin_modules` | OFF | Incomplete admin areas stay hidden. |
| `ENABLE_API_EXECUTION` | false / unset | Live tenant execution remains a developer/staging opt-in. |
| `NEXT_PUBLIC_ENABLE_LIVE_API_UI` | false / unset | Client credential/run UI remains opt-in. |
| `vercel_deployment`, `git_commit`, `project_download`, `vercel_import` | OFF | Enterprise feature flags remain disabled until their operational controls are approved. `ENABLE_AGENT_GIT_COMMIT` is an additional local-only commit gate. |
| Postgres RLS | not deployed | Requires database roles/policies and production validation; application org scoping remains the current control. |
