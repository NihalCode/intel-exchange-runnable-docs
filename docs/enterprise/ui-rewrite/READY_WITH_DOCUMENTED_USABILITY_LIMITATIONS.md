# READY WITH DOCUMENTED USABILITY LIMITATIONS

**Status:** Local verification complete (2026-07-21 follow-up session). Production canary not run.

**Readiness line:** `VERIFIED WITH DOCUMENTED USABILITY LIMITATIONS`

## Gates (post-fix)

| Gate | Result |
|------|--------|
| `npm test` | Pass (1335 tests) |
| `npm run typecheck` | Pass |
| `npm run lint -- --max-warnings=0` | Pass |
| `npm run build` | Pass (1535 pages) |
| Browser smoke (local) | `/docs/ctix`, `/agent`, `/settings` → `/settings/users` verified |
| `npm run security:scan-secrets` | Not re-run this session (unchanged security posture) |

## Fixes this session (follow-up)

1. **Ask AI raw env error** — `AUTH_DISABLED` local dev no longer requires `DEVELOPER_ACCESS_TOKEN` for docs/agent APIs; user-facing errors sanitized via `src/lib/user-facing-errors.ts`.
2. **Sign-in Auth0 jargon** — `/sign-in` humanized; env var names logged server-side only.
3. **Search result dead end** — `DocsSearch` uses explicit `router.push`, respects ProductContext “This product” scope.
4. **Settings 404** — `/settings` redirects to `/settings/users`.
5. **Settings/users copy** — plain-language errors when user list unavailable; Auth0 jargon removed from add-user form.
6. **Ask AI vs Auth trust mismatch** — local preview messaging aligned (`docsPreviewMode` + CredentialManager banner).
7. **Changelog empty state** — useful copy + CTAs.

## Prior session fixes (unchanged)

- CSAP/CFTR/Orchestrate section docs 500 (`extractMarkdownHeadings`)
- Mobile Ask AI in docs drawer

## Documented limitations

See [NON_TECHNICAL_UI_FINDINGS.md](./NON_TECHNICAL_UI_FINDINGS.md).

Summary:

- Production multi-domain canaries not validated.
- Legacy CTIX `/docs/[...slug]` lacks breadcrumb/TOC treatment.
- Home search remains dropdown-only (no dedicated results page).
- Orchestrate overview ingested markdown artifact (F-003).
- Playwright e2e not re-run locally.
- Intermittent doc crashes not reproduced in this pass after prior `extractMarkdownHeadings` fix; monitor in CI/e2e.
- Full keyboard-only and Viewer role browser passes deferred.

## Security preserved

SecretKey memory-only, Viewer snippet restriction, Ask AI permission gates, MFA/SSO — unchanged. Production `AUTH_DISABLED` deployments still require developer token for API access when not in local dev.
