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
- Hybrid retrieval + degraded evidence UX + LLM plan contracts
- API runner SSRF injectable DNS + destination checks
- Focused a11y (skip link, landmarks, live regions, focus trap)
- Phase 17 eval corpus started; CI workflow (lint/typecheck/test/build/secret-scan)

## Remaining / deferred

- Full Zendesk Support Agent (feature remains default-off)
- Full SSE streaming protocol (cancel exists; response still request/response)
- Postgres RLS rollout + mandatory MFA for all sensitive admin ops
- Broader screen-reader / a11y regression suite
- Eval release thresholds & canary for model/index changes

## Explicit product overrides

- **Docs are NOT public** until product asks to reopen Phase 2 public allowlist.
- **AI agent requires Auth0 + valid product credentials** before asking.
