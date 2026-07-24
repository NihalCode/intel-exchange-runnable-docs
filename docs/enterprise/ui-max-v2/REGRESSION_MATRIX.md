# Regression Matrix

| Area | Check | Expected |
|---|---|---|
| Sign-in | Continue password href | Fresh-login start, no local password |
| Sign-up | Email submit | Okta setup email API only |
| Access pages | Back to sign-in | Hard navigation with error query |
| Docs Run | Viewer | Cannot run (existing gate) |
| Ask AI | Permission | Hidden when not allowed |
| Command palette | Viewer | No admin/users if unauthorized |
| Query analytics | Metrics | Same numbers as API summary |
| Unanswered | Status buttons | Same review statuses |
| Feature flags | `enterprise_ui_v2` | Still default ON |
| Structural tests | Markers | `cx-*` + home/admin markers intact |

Automated: `npm test` · `npm run typecheck` · `npm run lint -- --max-warnings=0` · `npm run build`
